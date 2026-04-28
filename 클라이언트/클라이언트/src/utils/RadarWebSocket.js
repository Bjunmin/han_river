import pako from "pako";

export class RadarWebSocket {
    constructor({ url, onRadarData, onMessage, onOpen, onClose }) {
        this.url = url;
        this.onRadarData = onRadarData;
        this.onMessage = onMessage;
        this.onOpen = onOpen;
        this.onClose = onClose;
        this.isManualClose = false; // 수동 종료 여부

        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.pingTimeout = null;
        this.reconnectDelay = 5000;

        this.connect();

    }

    connect() {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            this.onOpen?.();

            // 핑-퐁 타이머 시작
            // this.startHeartbeat();
        };

        this.ws.onmessage = (event) => {
            if (typeof event.data === "string") {
                const msg = JSON.parse(event.data);
                if (msg.type === "pong") {
                    clearTimeout(this.pingTimeout);
                } else {
                    this.onMessage?.(msg);
                }
            } else {
                const buffer = event.data;
                const decompressed = pako.ungzip(new Uint8Array(buffer));
                const dataView = new DataView(decompressed.buffer);

                const frameData = {};
                let offset = 0;

                // count 먼저 읽기
                const count = dataView.getUint16(offset, true);
                offset += 2;

                while (offset < decompressed.length) {
                    const index = dataView.getUint16(offset, true);
                    offset += 2;

                    const data = [];
                    for (let i = 0; i < count; i++) {
                        data.push(dataView.getUint8(offset++));
                    }

                    frameData[index] = { count: count, data };
                }

                this.onRadarData?.(frameData);
            }
        };

        this.ws.onclose = () => {
            this.onClose?.();
            this.stopHeartbeat();
            if (!this.isManualClose) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = () => {
            this.ws.close();
        };
    }

    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.reconnectDelay);
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: "ping" }));

                // pong이 5초 내에 안 오면 강제 close
                this.pingTimeout = setTimeout(() => {
                    this.ws.close();
                }, 5000);
            }
        }, 15000); // 15초마다 ping
    }

    stopHeartbeat() {
        clearInterval(this.heartbeatInterval);
        clearTimeout(this.pingTimeout);
    }

    close() {     
        this.isManualClose = true;
        this.stopHeartbeat();
        this.stopReconnect();
        this.ws.close();
    }

    stopReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

}
