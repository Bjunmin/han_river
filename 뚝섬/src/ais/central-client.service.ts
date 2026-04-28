import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as WebSocket from 'ws';
import { ErrorLoggerService } from 'src/common/logger/error-logger.service';
import { envVariableKeys } from 'src/common/const/env.const';
import {
    getCapabilities,
    resolveSiteMode,
    SiteMode,
} from 'src/common/const/site-mode.const';

/**
 * 엣지 → 중앙 WS 클라이언트
 *
 *  - SITE_MODE=edge 일 때만 활성화
 *  - CENTRAL_WS_URL 로 outbound WS 연결
 *  - ping 30s / pong timeout 10s
 *  - 끊기면 exp backoff [1,2,4,8,16,30]s 로 재연결 (무한)
 *  - 끊긴 구간 60초/최대 1000건 ring buffer → 재접속 시 flush
 *  - 모든 payload 에 site / ts 메타 추가
 *
 * 다른 모드(standalone/combined/central) 에서는 start() 자체가 no-op.
 */

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const BUFFER_MAX_MS = 60_000;
const BUFFER_MAX_ITEMS = 1000;

interface BufferedItem {
    ts: number;
    payload: any;
}

@Injectable()
export class CentralClientService implements OnModuleInit, OnModuleDestroy {
    private ws: WebSocket | null = null;
    private siteMode: SiteMode = 'standalone';
    private siteName = '로컬';
    private centralUrl: string | null = null;

    private reconnectAttempt = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private pingTimer: NodeJS.Timeout | null = null;
    private pongTimer: NodeJS.Timeout | null = null;

    private ringBuffer: BufferedItem[] = [];
    private totalConnects = 0;
    private lastPongAt = 0;
    private connected = false;
    private stopped = false;

    constructor(
        private readonly config: ConfigService,
        private readonly logger: ErrorLoggerService,
    ) { }

    // ------------------------------------------------------------
    // life-cycle
    // ------------------------------------------------------------
    onModuleInit() {
        this.siteMode = resolveSiteMode(this.config.get<string>(envVariableKeys.siteMode));
        this.siteName = (this.config.get<string>(envVariableKeys.siteName) ?? '로컬').trim();
        this.centralUrl = (this.config.get<string>(envVariableKeys.centralWsUrl) ?? '').trim() || null;

        const cap = getCapabilities(this.siteMode);
        if (!cap.pushToCentralEnabled) {
            this.logger.structured('info', 'CentralClient', 'disabled', {
                reason: 'mode does not push to central',
                mode: this.siteMode,
            });
            return;
        }
        if (!this.centralUrl) {
            this.logger.structured('warn', 'CentralClient', 'disabled', {
                reason: 'CENTRAL_WS_URL empty',
                mode: this.siteMode,
            });
            return;
        }

        this.logger.structured('info', 'CentralClient', 'startup', {
            site: this.siteName,
            mode: this.siteMode,
            url: this.centralUrl,
        });
        this.connect();
    }

    onModuleDestroy() {
        this.stopped = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (this.pongTimer) clearTimeout(this.pongTimer);
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                this.ws.close();
            } catch { /* noop */ }
        }
    }

    // ------------------------------------------------------------
    // public API — AisService 가 호출
    // ------------------------------------------------------------
    /** 엣지 모드 여부 */
    isEnabled(): boolean {
        const cap = getCapabilities(this.siteMode);
        return cap.pushToCentralEnabled && !!this.centralUrl;
    }

    /** AIS decode 결과를 중앙으로 push */
    pushAis(payload: any): void {
        if (!this.isEnabled()) return;

        const envelope = {
            type: 'ais',
            site: this.siteName,
            ts: Date.now(),
            payload,
        };

        if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(envelope));
                return;
            } catch (err: any) {
                this.logger.structured('warn', 'CentralClient', 'send_fail_buffering', {
                    error: err?.message,
                });
            }
        }
        // 연결 안됐거나 실패 → 버퍼에 누적
        this.pushToBuffer(envelope);
    }

    /** 상태 스냅샷 (/health 용) */
    snapshot() {
        return {
            enabled: this.isEnabled(),
            url: this.centralUrl,
            connected: this.connected,
            reconnectAttempt: this.reconnectAttempt,
            totalConnects: this.totalConnects,
            bufferedItems: this.ringBuffer.length,
            lastPongAt: this.lastPongAt || null,
        };
    }

    // ------------------------------------------------------------
    // internal
    // ------------------------------------------------------------
    private connect() {
        if (this.stopped || !this.centralUrl) return;

        try {
            this.ws = new WebSocket(this.centralUrl, {
                handshakeTimeout: 10_000,
            });
        } catch (err: any) {
            this.logger.structured('error', 'CentralClient', 'ctor_fail', {
                url: this.centralUrl,
                error: err?.message,
            });
            this.scheduleReconnect();
            return;
        }

        this.ws.on('open', () => {
            this.connected = true;
            this.reconnectAttempt = 0;
            this.totalConnects++;
            this.lastPongAt = Date.now();
            this.logger.structured('info', 'CentralClient', 'connected', {
                url: this.centralUrl,
                totalConnects: this.totalConnects,
            });

            // 초기 hello
            try {
                this.ws?.send(JSON.stringify({
                    type: 'hello',
                    site: this.siteName,
                    ts: Date.now(),
                }));
            } catch { /* ignore */ }

            // 재접속 시 버퍼 flush
            this.flushBuffer();
            this.startHeartbeat();
        });

        this.ws.on('pong', () => {
            this.lastPongAt = Date.now();
            if (this.pongTimer) clearTimeout(this.pongTimer);
        });

        this.ws.on('message', (_data) => {
            // central → edge 메시지. 지금은 ping/pong 외에 정의된 것 없음 → 그냥 수신 카운트만
            this.lastPongAt = Date.now();
        });

        this.ws.on('error', (err: any) => {
            this.logger.structured('warn', 'CentralClient', 'ws_error', {
                error: err?.message,
            });
            // close 핸들러에서 재연결 트리거 — 여기서 close 호출은 안 함
        });

        this.ws.on('close', (code, reason) => {
            this.connected = false;
            this.stopHeartbeat();
            this.logger.structured('warn', 'CentralClient', 'disconnected', {
                code,
                reason: reason?.toString(),
            });
            this.scheduleReconnect();
        });
    }

    private scheduleReconnect() {
        if (this.stopped) return;
        if (this.reconnectTimer) return;

        const delay = BACKOFF_MS[Math.min(this.reconnectAttempt, BACKOFF_MS.length - 1)];
        this.reconnectAttempt++;
        this.logger.structured('info', 'CentralClient', 'reconnect_scheduled', {
            attempt: this.reconnectAttempt,
            delayMs: delay,
        });
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState !== WebSocket.OPEN) return;
            try {
                this.ws.ping();
            } catch { /* ignore */ }
            this.pongTimer = setTimeout(() => {
                this.logger.structured('warn', 'CentralClient', 'pong_timeout', {
                    lastPongAt: this.lastPongAt,
                });
                try {
                    this.ws?.terminate();
                } catch { /* ignore */ }
            }, PONG_TIMEOUT_MS);
        }, PING_INTERVAL_MS);
    }

    private stopHeartbeat() {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
    }

    private pushToBuffer(envelope: any) {
        const now = Date.now();
        // 60초 넘는 것 비우기
        const cutoff = now - BUFFER_MAX_MS;
        while (this.ringBuffer.length && this.ringBuffer[0].ts < cutoff) {
            this.ringBuffer.shift();
        }
        this.ringBuffer.push({ ts: now, payload: envelope });
        // 1000건 초과 시 오래된 것 drop
        while (this.ringBuffer.length > BUFFER_MAX_ITEMS) {
            this.ringBuffer.shift();
        }
    }

    private flushBuffer() {
        if (!this.ringBuffer.length) return;
        const cutoff = Date.now() - BUFFER_MAX_MS;
        const items = this.ringBuffer.filter((i) => i.ts >= cutoff);
        const dropped = this.ringBuffer.length - items.length;
        this.ringBuffer = [];
        for (const it of items) {
            if (this.ws?.readyState !== WebSocket.OPEN) break;
            try {
                this.ws.send(JSON.stringify(it.payload));
            } catch { /* ignore */ }
        }
        this.logger.structured('info', 'CentralClient', 'buffer_flushed', {
            sent: items.length,
            dropped,
        });
    }
}
