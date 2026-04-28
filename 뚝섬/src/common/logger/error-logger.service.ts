import { Injectable, LoggerService } from '@nestjs/common';
import { AppLoggerInstance, createErrorLogger } from './logger.config';

/**
 * 한강 AIS 로그 서비스
 * - 3파일 로테이션 (app/error/ais), 30일 보관
 * - NestJS LoggerService 호환 — app.useLogger(errorLogger) 도 가능
 * - 기존 코드의 .log/.info/.warn/.error 호출 그대로 동작
 * - structured(level, event, meta) 로 구조화 이벤트 로그
 */
@Injectable()
export class ErrorLoggerService implements LoggerService {
    private readonly logger: AppLoggerInstance = createErrorLogger('ais');
    private defaultContext: string = 'App';

    // ---- NestJS LoggerService 인터페이스 ----
    log(message: any, context?: string | Record<string, unknown>) {
        this.write('info', message, context);
    }
    error(message: any, trace?: string | Record<string, unknown>, context?: string) {
        // 하경한 님 기존 호출: logger.error('msg', { error, stack })
        // NestJS 내부 호출: logger.error('msg', stackString, contextString)
        if (typeof trace === 'object' && trace !== null) {
            this.logger.error(this.fmt(message), {
                context: context ?? this.defaultContext,
                ...trace,
            });
        } else {
            this.logger.error(this.fmt(message), {
                context: context ?? this.defaultContext,
                ...(trace ? { trace } : {}),
            });
        }
    }
    warn(message: any, context?: string | Record<string, unknown>) {
        this.write('warn', message, context);
    }
    debug(message: any, context?: string | Record<string, unknown>) {
        this.write('debug', message, context);
    }
    verbose(message: any, context?: string | Record<string, unknown>) {
        this.write('debug', message, context);
    }
    info(message: any, context?: string | Record<string, unknown>) {
        this.write('info', message, context);
    }

    /** NestJS Logger 패턴: setContext('AisService') 후 이후 로그는 그 컨텍스트 */
    setContext(name: string) {
        this.defaultContext = name;
    }

    /** 구조화 이벤트 로그 — 이벤트 추적/grep 용 */
    structured(
        level: 'debug' | 'info' | 'warn' | 'error',
        context: string,
        event: string,
        meta?: Record<string, unknown>,
    ) {
        this.logger.structured(level, context, event, meta);
    }

    /** 하경한 님 기존 서브모듈 호환: logger.info('msg', {k:v}) */
    private write(level: 'debug' | 'info' | 'warn', message: any, ctxOrMeta?: any) {
        // ctxOrMeta 가 문자열이면 NestJS 스타일 context, 객체이면 meta
        if (typeof ctxOrMeta === 'string' || ctxOrMeta === undefined) {
            this.logger.log({
                level,
                message: this.fmt(message),
                context: ctxOrMeta ?? this.defaultContext,
            });
        } else {
            this.logger.log({
                level,
                message: this.fmt(message),
                context: this.defaultContext,
                ...ctxOrMeta,
            });
        }
    }

    private fmt(message: any): string {
        if (message === null || message === undefined) return '';
        if (typeof message === 'string') return message;
        if (message instanceof Error) return message.stack ?? message.message;
        try {
            return JSON.stringify(message);
        } catch {
            return String(message);
        }
    }
}
