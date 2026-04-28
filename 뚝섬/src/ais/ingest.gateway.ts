import { Injectable, OnModuleInit } from '@nestjs/common';
import * as WebSocket from 'ws';
import { WsServerProvider } from 'src/common/ws/ws-server.provider';
import { ErrorLoggerService } from 'src/common/logger/error-logger.service';
import { ConfigService } from '@nestjs/config';
import { envVariableKeys } from 'src/common/const/env.const';
import {
    getCapabilities,
    resolveSiteMode,
    SiteCapabilities,
    SiteMode,
} from 'src/common/const/site-mode.const';
import { AisService } from './ais.service';

/**
 * 중앙 ← 엣지 WS 수신 게이트웨이 (central / combined 모드 전용)
 *
 *  - /ingest 경로로 들어온 AIS 데이터를 AisService.saveAISData 로 주입
 *  - source(site) 태그를 payload 에 __source 로 박아서 넘김
 *  - ping/pong 지원 (CentralClient 에서 ws.ping 으로 오는 것과는 별도로 app-level ping 도 허용)
 *  - standalone/edge 모드에서는 etup 을 스킵
 */
@Injectable()
export class IngestGateway implements OnModuleInit {
    private siteMode: SiteMode = 'standalone';
    private cap: SiteCapabilities = getCapabilities('standalone');
    private enabled = false;

    private connected = new Map<WebSocket, { site?: string; connectedAt: number }>();

    constructor(
        private readonly wsServer: WsServerProvider,
        private readonly logger: ErrorLoggerService,
        private readonly configService: ConfigService,
        private readonly aisService: AisService,
    ) { }

    onModuleInit() {
        this.siteMode = resolveSiteMode(this.configService.get<string>(envVariableKeys.siteMode));
        this.cap = getCapabilities(this.siteMode);
        this.enabled = this.cap.ingestEnabled;

        if (!this.enabled) {
            this.logger.structured('info', 'Ingest', 'disabled', {
                reason: 'mode does not accept ingest',
                mode: this.siteMode,
            });
            return;
        }

        this.logger.structured('info', 'Ingest', 'listening', {
            path: '/ingest',
            mode: this.siteMode,
        });

        this.wsServer.onConnection('/ingest', (client) => {
            this.connected.set(client, { connectedAt: Date.now() });
            this.logger.structured('info', 'Ingest', 'edge_connected', {
                totalEdges: this.connected.size,
            });

            client.on('close', () => {
                const info = this.connected.get(client);
                this.connected.delete(client);
                this.logger.structured('info', 'Ingest', 'edge_disconnected', {
                    site: info?.site,
                    totalEdges: this.connected.size,
                });
            });
        });

        this.wsServer.onMessage('/ingest', (client, raw) => {
            this.handleIngest(client, raw);
        });
    }

    private handleIngest(client: WebSocket, raw: any) {
        let msg: any;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e: any) {
            this.logger.structured('warn', 'Ingest', 'parse_fail', {
                error: e?.message,
            });
            return;
        }

        const { type, site, ts, payload } = msg || {};

        // hello: 엣지가 자기 site 이름 알려줌
        if (type === 'hello') {
            const info = this.connected.get(client);
            if (info) info.site = site;
            this.logger.structured('info', 'Ingest', 'edge_hello', {
                site,
                ts,
            });
            this.safeSend(client, { type: 'hello_ack', ts: Date.now() });
            return;
        }

        if (type === 'ping') {
            this.safeSend(client, { type: 'pong', ts: Date.now() });
            return;
        }

        if (type === 'ais') {
            if (!payload) return;
            // 엣지가 보낸 site 를 __source 로 태깅하여 주입
            const tagged = { ...payload, __source: payload.source || site || 'edge' };
            try {
                // fire-and-forget — 내부에서 에러 처리함
                this.aisService.saveAISData(tagged).catch((err: any) => {
                    this.logger.structured('warn', 'Ingest', 'save_fail', {
                        error: err?.message,
                    });
                });
            } catch (err: any) {
                this.logger.structured('warn', 'Ingest', 'save_throw', {
                    error: err?.message,
                });
            }
            return;
        }

        // 그 외 타입은 무시 (로그만)
        this.logger.structured('debug', 'Ingest', 'unknown_type', { type });
    }

    private safeSend(client: WebSocket, payload: any) {
        if (client.readyState !== WebSocket.OPEN) return;
        try {
            client.send(JSON.stringify(payload));
        } catch {
            /* noop */
        }
    }

    /** /health 요약 */
    snapshot() {
        const now = Date.now();
        return {
            enabled: this.enabled,
            mode: this.siteMode,
            connectedEdges: [...this.connected.values()].map((v) => ({
                site: v.site ?? '(unknown)',
                uptimeMs: now - v.connectedAt,
            })),
        };
    }
}
