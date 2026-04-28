// Node.js 18 이하에서 global crypto 폴리필 (TypeORM 등에서 사용)
import { webcrypto } from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';
import { createErrorLogger } from './common/logger/logger.config';
import { ErrorLoggerService } from './common/logger/error-logger.service';

// import { MqttModule } from './mqtt/mqtt.module';

async function bootstrap() {
  // 🔥 로거 초기화 (30일 보관, app/error/ais 3파일 rotation)
  const errorLogger = createErrorLogger('ais');

  // ---- 전역 에러 핸들러 (서버 사망 방지) ----
  process.on('uncaughtException', (error) => {
    try {
      errorLogger.structured('error', 'Process', 'uncaught_exception', {
        message: error?.message,
        stack: error?.stack,
      });
    } catch { /* logger 자체가 죽으면 stderr 로 */
      // eslint-disable-next-line no-console
      console.error('[FATAL] uncaughtException', error);
    }
    // process.exit 하지 않는다 — PM2/NSSM 이 필요하면 재시작
  });

  process.on('unhandledRejection', (reason: any) => {
    try {
      errorLogger.structured('error', 'Process', 'unhandled_rejection', {
        reason: reason?.message ?? String(reason),
        stack: reason?.stack,
      });
    } catch {
      // eslint-disable-next-line no-console
      console.error('[FATAL] unhandledRejection', reason);
    }
  });

  // ---- App 부팅 ----
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 버퍼로 로그를 담아뒀다가 useLogger 붙인 뒤 방출
    bufferLogs: true,
  });

  // Nest Logger 를 우리 Winston 래퍼로 교체
  const loggerService = app.get(ErrorLoggerService);
  app.useLogger(loggerService);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // PMTiles 파일 서빙
  const pmtilesPath = join(process.cwd(), 'public', 'pmtiles');
  app.use('/data', express.static(pmtilesPath, {
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Range');
      res.set('Accept-Ranges', 'bytes');
      res.set('Content-Type', 'application/octet-stream');
    },
  }));

  // SIGTERM/SIGINT 수신 시 Nest hook 실행 → OnModuleDestroy 불림
  app.enableShutdownHooks();

  await app.startAllMicroservices();
  const port = Number(process.env.PORT ?? 7400);
  await app.listen(port);
  errorLogger.structured('info', 'Bootstrap', 'listening', {
    port,
    node: process.version,
    pid: process.pid,
  });

  // ---- Graceful shutdown (중복 안전) ----
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    errorLogger.structured('info', 'Process', 'shutdown_begin', { signal });
    try {
      await app.close();
      errorLogger.structured('info', 'Process', 'shutdown_done', { signal });
    } catch (err: any) {
      errorLogger.structured('error', 'Process', 'shutdown_error', {
        signal,
        error: err?.message,
      });
    } finally {
      // 로그 flush 여유를 주고 종료 (PM2/NSSM 이 재시작)
      setTimeout(() => process.exit(0), 500);
    }
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  // ---- 메모리 사용량 모니터링 (1분마다) ----
  setInterval(() => {
    const used = process.memoryUsage();
    errorLogger.structured('info', 'Process', 'memory_usage', {
      rssMb: Math.round(used.rss / 1024 / 1024),
      heapTotalMb: Math.round(used.heapTotal / 1024 / 1024),
      heapUsedMb: Math.round(used.heapUsed / 1024 / 1024),
      uptimeSec: Math.round(process.uptime()),
    });
  }, 60_000);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[FATAL] bootstrap failed', err);
  process.exit(1);
});
