// import { api } from "@/api/api";

// import { api } from "@/api/api";
// import config from "@/api/config"
import { RadarWebSocket } from "@/utils/RadarWebSocket";
import { api } from "@/api/api";

export const AIS = {
    state: {
        aisSocket: null,
        isConnected: false,
        aisData: [],
        aisGPS: {
            lat: 35.1358, // 건물 위치 위도로 변경 필요
            lon: 129.07, // 건물 위치 경도로 변경 필요
            heading: 0
        },
        myShipGPS: {
            lat: 35.1358, // 건물 위치 위도로 변경 필요
            lon: 129.07, // 건물 위치 경도로 변경 필요
            heading: 0
        },
        mapCenterGPS: {
            lat: 35.1358, // 건물 위치 위도로 변경 필요
            lon: 129.07, // 건물 위치 경도로 변경 필요
            heading: 0
        },
        selectedMMSI: null,
        isReceivce: false,
        offsetX: 0,
        offsetY: 0,
        aisDateData: [],
        aisDateNextCursor: null, // cursor 페이지네이션: 다음 페이지 커서 ID
        aisDateHasNext: false,   // cursor 페이지네이션: 다음 페이지 존재 여부
        aisListByDate: [], // 날짜 범위로 조회한 AIS 리스트
        allAISData: [],
        timeoutId: null, // 타이머 ID를 state에 저장하여 메모리 누수 방지
        aisCommunicationConfig: {
            type: 0, // 0: serial, 1: tcp
            serialPort: '/dev/tty.usbserial-110',
            tcpIp: '127.0.0.1',
            tcpPort: 4001
        },
        serialPorts: [],
        aisCommunicationStatus: {
            connected: false,
            type: 0
        },
    },
    getters: {
        getAISSocket(state) {
            return state.aisSocket
        },
        getAISSocketConnected(state) {
            return state.isConnected
        },
        getAISData(state) {
            return state.aisData
        },
        getSelectedMMSI(state) {
            return state.selectedMMSI
        },
        getIsReceive(state) {
            return state.isReceivce
        },
        getOffsetX(state) {
            return state.offsetX
        },
        getOffsetY(state) {
            return state.offsetY
        },
        getAISGPS(state) {
            return state.aisGPS
        },
        getMyShipGPS(state) {
            return state.myShipGPS
        },
        getMapCenterGPS(state) {
            return state.mapCenterGPS
        },
        getAISDateData(state) {
            return state.aisDateData;
        },
        getAISDateHasNext(state) {
            return state.aisDateHasNext;
        },
        getAISDateNextCursor(state) {
            return state.aisDateNextCursor;
        },
        getAISListByDate(state) {
            return state.aisListByDate;
        },
        getAllAISData(state) {
            return state.allAISData
        },
        getTimeoutId(state) {
            return state.timeoutId
        },
        getAISCommunicationConfig(state) {
            return state.aisCommunicationConfig
        },
        getSerialPorts(state) {
            return state.serialPorts
        },
        getAISCommunicationStatus(state) {
            return state.aisCommunicationStatus
        }
    },
    mutations: {
        setAISSocket(state, payload) {
            state.aisSocket = payload
        },
        setAISSocketConnected(state, payload) {
            state.isConnected = payload
        },
        setAISData(state, payload) {
            // MMSI 기준 중복 제거 (다중 포트 수신 또는 서버 중복 방어)
            const seen = new Set();
            state.aisData = payload.filter(pos => {
                const mmsi = pos.value?.[0]?.mmsi;
                if (mmsi == null || seen.has(mmsi)) return false;
                seen.add(mmsi);
                return true;
            });
        },
        setSelectedMMSI(state, payload) {
            state.selectedMMSI = payload;
        },
        setIsReceive(state, payload) {
            state.isReceivce = payload;
        },
        setOffset(state, payload) {
            state.offsetX = payload.offsetX;
            state.offsetY = payload.offsetY;
        },
        setAISGPS(state, payload) {
            state.aisGPS = payload;
        },
        setMyShipGPS(state, payload) {
            state.myShipGPS = payload;
        },
        setMapCenterGPS(state, payload) {
            state.mapCenterGPS = payload;
        },
        setAISDateData(state, payload) {
            state.aisDateData = payload;
        },
        appendAISDateData(state, payload) {
            state.aisDateData = [...state.aisDateData, ...payload];
        },
        setAISDateNextCursor(state, payload) {
            state.aisDateNextCursor = payload;
        },
        setAISDateHasNext(state, payload) {
            state.aisDateHasNext = payload;
        },
        setAISListByDate(state, payload) {
            state.aisListByDate = payload;
        },
        setAllAISData(state, payload) {
            state.allAISData = payload;
        },
        setTimeoutId(state, payload) {
            state.timeoutId = payload
        },
        setAISCommunicationConfig(state, payload) {
            state.aisCommunicationConfig = payload
        },
        setSerialPorts(state, payload) {
            state.serialPorts = payload
        },
        setAISCommunicationStatus(state, payload) {
            state.aisCommunicationStatus = payload
        }
    },
    actions: {
        connectAISSocket({ commit, getters, state }) {
            // 기존 소켓이 있으면 먼저 닫기
            if (state.aisSocket) {
                state.aisSocket.close();
                commit('setAISSocket', null);
            }

            const ip = getters.getAISIP;
            const port = getters.getAISWSPort;
            const url = `ws://${ip}:${port}/ais`

            const aisSocket = new RadarWebSocket({
                url,
                onMessage: (msg) => {
                    switch (msg.type) {
                        case "AISConnected":
                            commit("setAISSocketConnected", msg.status);
                            break;
                        case "AISData": {
                            const payload = msg.payload;
                            const mmsiList = payload.map(p => p.key);
                            const uniqueSet = new Set(mmsiList);
                            if (mmsiList.length !== uniqueSet.size) {
                                console.warn('[AISData] 중복 MMSI 수신!', mmsiList.length, '->', uniqueSet.size, mmsiList.filter((m, i) => mmsiList.indexOf(m) !== i));
                            }
                            commit('setAISData', payload);
                            commit("setIsReceive", true);
                            checkDataTimeout();
                            break;
                        }
                    }
                },
                onOpen: () => {
                    commit('setAISSocketConnected', true);
                },
                onClose: () => {
                    // 연결 종료 시 타이머 정리
                    if (state.timeoutId) {
                        clearTimeout(state.timeoutId);
                        commit("setTimeoutId", null);
                    }
                    commit('setAISSocketConnected', false);
                },
            });

            const checkDataTimeout = () => {
                // 기존 타이머가 있으면 취소
                if (state.timeoutId) {
                    clearTimeout(state.timeoutId);
                }

                const timeoutId = setTimeout(() => {
                    commit("setIsReceive", false);
                    commit("setTimeoutId", null);
                }, 2 * 60 * 1000); // 2분 후에 실행

                commit("setTimeoutId", timeoutId);
            };

            commit('setAISSocket', aisSocket);
        },

        disconnectAISSocket({ state, commit }) {
            // 타이머 정리
            if (state.timeoutId) {
                clearTimeout(state.timeoutId);
                commit("setTimeoutId", null);
            }

            if (state.aisSocket) {
                state.aisSocket.close();
                commit('setAISSocket', null);
                commit('setAISSocketConnected', false);
            }
        },
        async getAISDataBetweenDate({commit}, args) {
            try {
                const res = await api.ais.getAISDateBetweenDate(args);
                const data = res.data;
                // 서버가 { items, nextCursorId, hasNext } 형태로 응답
                commit("setAISDateData", data.items ?? data);
                commit("setAISDateNextCursor", data.nextCursorId ?? null);
                commit("setAISDateHasNext", data.hasNext ?? false);
            } catch (err) {
                console.log("getAISDataBetweenDate Err:", err);
            }
        },

        async loadMoreAISHistory({commit, state}, args) {
            try {
                const res = await api.ais.getAISDateBetweenDate({
                    ...args,
                    cursorId: state.aisDateNextCursor,
                });
                const data = res.data;
                commit("appendAISDateData", data.items ?? []);
                commit("setAISDateNextCursor", data.nextCursorId ?? null);
                commit("setAISDateHasNext", data.hasNext ?? false);
            } catch (err) {
                console.log("loadMoreAISHistory Err:", err);
            }
        },

        async getAllAISData({commit}) {
            try {
                const res = await api.ais.getAllAISData()
                commit("setAllAISData", res.data)
            } catch (err) {
                // 에러 무시
            }
        },

        async getAISCommunicationConfig({ commit }) {
            try {
                const res = await api.ais.getAISCommunicationConfig();
                commit("setAISCommunicationConfig", res.data);
                return res.data;
            } catch (err) {
                // 기본값 반환 (0: serial)
                const defaultConfig = {
                    type: 0,
                    serialPort: '/dev/tty.usbserial-110',
                    tcpIp: '127.0.0.1',
                    tcpPort: 4001
                };
                commit("setAISCommunicationConfig", defaultConfig);
                return defaultConfig;
            }
        },

        async updateAISCommunicationConfig({ commit }, config) {
            try {
                const res = await api.ais.updateAISCommunicationConfig(config);
                commit("setAISCommunicationConfig", config);
                return res.data;
            } catch (err) {
                console.log("updateAISCommunicationConfig err: ", err);
                throw err;
            }
        },

        async getSerialPorts({ commit }) {
            try {
                const res = await api.ais.getSerialPorts();
                commit("setSerialPorts", res.data || []);
                return res.data || [];
            } catch (err) {
                commit("setSerialPorts", []);
                return [];
            }
        },

        async getAISCommunicationStatus({ commit }) {
            try {
                const res = await api.ais.getAISCommunicationStatus();
                commit("setAISCommunicationStatus", res.data || { connected: false, type: 0 });
                return res.data || { connected: false, type: 0 };
            } catch (err) {
                commit("setAISCommunicationStatus", { connected: false, type: 0 });
                return { connected: false, type: 0 };
            }
        },

        async getAISGPS({ commit }) {
            try {
                const res = await api.setting.getAISGPS();
                const gps = res.data || { lat: 35.1358, lon: 129.07, heading: 0 }; // 건물 위치 좌표로 변경 필요
                // 내 선박 위치와 지도 중심 위치 모두 초기화
                commit("setMyShipGPS", gps);
                commit("setMapCenterGPS", gps);
                commit("setAISGPS", gps);
                return gps;
            } catch (err) {
                const defaultGPS = { lat: 35.1358, lon: 129.07, heading: 0 }; // 건물 위치 좌표로 변경 필요
                commit("setMyShipGPS", defaultGPS);
                commit("setMapCenterGPS", defaultGPS);
                commit("setAISGPS", defaultGPS);
                return defaultGPS;
            }
        },

        async setAISGPS({ commit }, gps) {
            try {
                const res = await api.setting.setAISGPS(gps);
                // 내 선박 위치만 업데이트 (서버에 저장)
                commit("setMyShipGPS", gps);
                commit("setAISGPS", gps);
                return res.data;
            } catch (err) {
                console.log("setAISGPS err: ", err);
                throw err;
            }
        }

    },
};
