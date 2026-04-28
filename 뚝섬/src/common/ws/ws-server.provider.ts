import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { ConfigService } from '@nestjs/config';
import { envVariableKeys } from 'src/common/const/env.const';

@Injectable()
export class WsServerProvider implements OnModuleInit {
    private readonly logger = new Logger(WsServerProvider.name);
    private wss: WebSocket.Server;
    private pathClientMap = new Map<string, Set<WebSocket>>();
    private connectionHandlers = new Map<string, ((client: WebSocket) => void)[]>();

    constructor(private readonly configService: ConfigService) { }

    onModuleInit() {
        if (this.wss) {
            this.logger.log('[WsServer] WebSocket 서버는 이미 생성됨');
            return;
        }

        const raw = this.configService.get<string>(envVariableKeys.wsPort);
        const wsPort = Number.parseInt(raw ?? '', 10) || 7410; // 기본 7410
        this.wss = new WebSocket.Server({ port: wsPort });
        this.logger.log(`[WsServer] WebSocket 서버 시작 — port ${wsPort}`);

        // 서버 레벨 error 핸들러 (없으면 uncaughtException → 서버 사망 가능)
        this.wss.on('error', (err) => {
            this.logger.error(`[WsServer] 서버 오류: ${err.message}`);
        });

        // 60초마다 종료된 클라이언트 정리 (메모리 누수 방지)
        setInterval(() => this.cleanupStaleClients(), 60000);

        this.wss.on('connection', (client: WebSocket, req: IncomingMessage) => {
            const path = new URL(req.url, `http://${req.headers.host}`).pathname;
            this.logger.log(`[WsServer] 클라이언트 연결됨: ${path}`);

            if (!this.pathClientMap.has(path)) {
                this.pathClientMap.set(path, new Set());
            }
            this.pathClientMap.get(path).add(client);

            // 클라이언트 레벨 error 핸들러 (없으면 uncaughtException → 서버 사망 가능)
            client.on('error', (err) => {
                this.logger.error(`[WsServer] 클라이언트 오류 (${path}): ${err.message}`);
                this.pathClientMap.get(path)?.delete(client);
            });

            // 🔥 path별 connection 이벤트 호출
            const handlers = this.connectionHandlers.get(path);
            handlers?.forEach(fn => fn(client));

            client.on('message', (msg) => {
                client.emit(`message::${path}`, msg); // path별로 이벤트 이름 지정
            });

            client.on('close', () => {
                this.logger.log(`[WsServer] 클라이언트 해제됨: ${path}`);
                this.pathClientMap.get(path)?.delete(client);
            });
        });
    }

    getClientsByPath(path: string): Set<WebSocket> {
        return this.pathClientMap.get(path) ?? new Set();
    }

    onMessage(path: string, handler: (client: WebSocket, msg: string) => void) {
        const registerListener = (client: WebSocket) => {
            client.on(`message::${path}`, (msg: string) => {
                handler(client, msg);
            });
        };

        const clients = this.getClientsByPath(path);
        for (const client of clients) {
            registerListener(client);
        }

        // ✅ 연결 이벤트 등록도 같이 해준다
        this.onConnection(path, registerListener);
    }

    // ✅ [1] path별 연결 이벤트 등록용 메서드 추가
    onConnection(path: string, handler: (client: WebSocket) => void) {
        if (!this.connectionHandlers.has(path)) {
            this.connectionHandlers.set(path, []);
        }
        this.connectionHandlers.get(path).push(handler);
    }

    sendToPath(path: string, data: any) {
        const json = typeof data === 'string' ? data : JSON.stringify(data);
        for (const client of this.getClientsByPath(path)) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(json);
                } catch (error: any) {
                    this.logger.error(`[WsServer] sendToPath(${path}) 전송 실패:`, error?.message);
                }
            }
        }
    }

    sendBufferToPath(path: string, buffer: Buffer) {
        for (const client of this.getClientsByPath(path)) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(buffer);
                } catch (error: any) {
                    this.logger.error(`[WsServer] sendBufferToPath(${path}) 전송 실패:`, error?.message);
                }
            }
        }
    }

    private cleanupStaleClients() {
        this.pathClientMap.forEach((clients, path) => {
            const before = clients.size;
            clients.forEach(client => {
                if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
                    clients.delete(client);
                }
            });
            const removed = before - clients.size;
            if (removed > 0) {
                this.logger.log(`[WsServer] ${path}: 종료된 클라이언트 ${removed}개 정리`);
            }
        });
    }
}
