import { Server } from 'ws';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AisService } from './ais.service';
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as WebSocket from 'ws';
import { WsServerProvider } from '../common/ws/ws-server.provider';
import { ErrorLoggerService } from '../common/logger/error-logger.service';

@Injectable()
export class AisGateway implements OnModuleInit {

    private aisConnected = false;

    constructor(
        private readonly wsServer: WsServerProvider,
        private readonly logger: ErrorLoggerService
    ) { }


    onModuleInit() {
        this.setupClientEvents()
    }

    setupClientEvents() {
        this.wsServer.onMessage('/ais', (client, msg) => {
            try {
                const data = JSON.parse(msg.toString());
                if (data.type === 'ping') {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'pong' }));
                    }
                } else {
                    this.handleMessage(client, data);
                }
            } catch (e) {
                this.logger.warn('AisGateway 메시지 파싱 오류', e);
            }

            // 연결된 클라이언트에게 상태 전달
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'AISConnected', status: this.aisConnected }));
            }
        });

        this.wsServer.onConnection('/ais', (client) => {
            this.logger.log('/ais 클라이언트 연결됨');
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'AISConnected', status: this.aisConnected }));
            }
        });
    }

    // 👉 클라이언트로부터 받은 메시지
    handleMessage(client: WebSocket, message: any) {
        this.logger.log(`클라이언트로부터 ais 메시지: ${JSON.stringify(message)}`);
        // TODO: radar 관련 로직
    }


    broadcastDeviceStatus(connected: boolean) {
        this.aisConnected = connected;
        this.sendToAll({ type: 'AISConnected', status: connected });
    }

    // ✅ /radar에 연결된 모든 클라이언트에게 전송
    sendToAll(payload: any) {
        this.wsServer.sendToPath('/ais', payload);
    }

    sendToAllRaw(buffer: Buffer) {
        this.wsServer.sendBufferToPath('/ais', buffer);
    }


    // // WebSocket 연결 시 호출
    // handleConnection(client: Socket) {
    //     console.log(`ais 클라이언트 연결됨: ${client.id}`);
    //     this.aisService.registerClient(client)
    // }

    // // WebSocket 연결 종료 시 호출
    // handleDisconnect(client: Socket) {
    //     console.log(`ais 클라이언트 연결 종료: ${client.id}`);
    //     this.aisService.removeClient(client.id);
    // }

    sendAisDataToClients(data: any) {
        // this.server.clients.forEach((client) => {
        //     if (client.readyState === WebSocket.OPEN) {
        //         client.send(JSON.stringify(data));
        //     }
        // });


        // 배열이 비어있으면 전송하지 않음
        if (data.length === 0) {
            this.logger.log('[AisGateway] AIS 데이터가 비어있어 전송하지 않음');
            return;
        }

        // this.logger.log(`[AisGateway] AIS 데이터 전송: ${data.length}개`);
        this.sendToAll({
            type: 'AISData',
            payload: data,
        });
    }
}
