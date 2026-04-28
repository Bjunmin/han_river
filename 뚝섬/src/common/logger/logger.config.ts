import * as winston from 'winston';
import { join, isAbsolute } from 'path';
import * as fs from 'fs';

// CommonJS 모듈이므로 require 사용
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DailyRotateFile = require('winston-daily-rotate-file');

/**
 * ------------------------------------------------------------
 * 한강 AIS — 24/7 운영용 3파일 로거
 * ------------------------------------------------------------
 *  app-YYYY-MM-DD.log   : info 이상 모든 로그 (일반 운영 로그)
 *  error-YYYY-MM-DD.log : error 레벨만 (운영자가 매일 아침 확인할 파일)
 *  ais-YYYY-MM-DD.log   : context 가 Ais* / CentralClient / Serial / Ingest 인 로그
 *                         (디버깅용. 양 많음)
 *
 * 공통:
 *  - 일별 로테이션
 *  - 20MB/파일 넘으면 자동 분할
 *  - 기본 30일 보관 (LOG_RETENTION_DAYS 로 override 가능)
 *  - 보관 만료 시 gzip 압축
 *  - 콘솔 출력 병행 (PM2 로그에도 남음)
 * ------------------------------------------------------------
 */

const AIS_CONTEXT_PATTERN = /^(Ais|CentralClient|Serial|Ingest|Edge|Dedup)/;

/** LOG_DIR 은 상대경로면 cwd 기준, 절대경로면 그대로 */
function resolveLogDir(envValue: string | undefined): string {
    const raw = (envValue ?? 'logs').trim() || 'logs';
    const dir = isAbsolute(raw) ? raw : join(process.cwd(), raw);
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch {
        // 권한 문제 등 — 나중에 winston 쓰기 시도할 때 재확인
    }
    return dir;
}

/** 기본값 30일, env 로 override */
function resolveRetentionDays(envValue: string | undefined): string {
    const n = Number(envValue);
    const days = Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
    return `${days}d`;
}

export interface AppLoggerInstance extends winston.Logger {
    /** 구조화 이벤트 로그. event='serial.reconnect_attempt' 같은 dotted 네이밍 권장 */
    structured(
        level: 'debug' | 'info' | 'warn' | 'error',
        context: string,
        event: string,
        meta?: Record<string, unknown>,
    ): void;
}

let singleton: AppLoggerInstance | null = null;

export const createErrorLogger = (serverName: string = 'ais'): AppLoggerInstance => {
    if (singleton) return singleton;

    const logDir = resolveLogDir(process.env.LOG_DIR);
    const maxFiles = resolveRetentionDays(process.env.LOG_RETENTION_DAYS);

    const baseFormat = winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
    );

    // 1) app — 모든 info+ 로그
    const appTransport = new DailyRotateFile({
        filename: join(logDir, 'app-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'info',
        maxSize: '20m',
        maxFiles,
        zippedArchive: true,
        format: baseFormat,
    });

    // 2) error — error 만
    const errorTransport = new DailyRotateFile({
        filename: join(logDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: '20m',
        maxFiles,
        zippedArchive: true,
        format: baseFormat,
    });

    // 3) ais — AIS 관련 컨텍스트만 (양 많아서 분리)
    const aisTransport = new DailyRotateFile({
        filename: join(logDir, 'ais-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'debug',
        maxSize: '20m',
        maxFiles,
        zippedArchive: true,
        format: winston.format.combine(
            winston.format((info) => {
                const ctx = (info as any).context ?? '';
                return typeof ctx === 'string' && AIS_CONTEXT_PATTERN.test(ctx) ? info : false;
            })(),
            baseFormat,
        ),
    });

    // 4) 콘솔 — PM2 가 pm2.out.log 로 모음
    const consoleTransport = new winston.transports.Console({
        level: 'info',
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, context, event, ...meta }) => {
                const ctx = context ? ` [${context}]` : '';
                const ev = event ? ` ${event}` : '';
                const rest = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
                return `${timestamp} ${level}${ctx}${ev}: ${message ?? ''}${rest}`;
            }),
        ),
    });

    const logger = winston.createLogger({
        level: 'debug',
        defaultMeta: { serverName },
        transports: [appTransport, errorTransport, aisTransport, consoleTransport],
        exceptionHandlers: [errorTransport, consoleTransport],
        rejectionHandlers: [errorTransport, consoleTransport],
        exitOnError: false,
    }) as AppLoggerInstance;

    logger.structured = function (level, context, event, meta) {
        this.log({
            level,
            message: event,
            context,
            event,
            ...(meta ?? {}),
        });
    };

    singleton = logger;
    return logger;
};

/** 이미 생성된 singleton 을 가져옴 (테스트·graceful shutdown flush 용도) */
export const getLogger = (): AppLoggerInstance => createErrorLogger('ais');
