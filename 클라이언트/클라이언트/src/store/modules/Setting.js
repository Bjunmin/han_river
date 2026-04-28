// import { api } from "@/api/api";

import { api } from "@/api/api";
import config from "@/api/config";
import store from "..";

export const Setting = {
    state: {
        lat: 0,
        lon: 0,
        heading: 0,
        showMap: true,
        mapOpacity: 50,
        showRadar: localStorage.getItem('showRadar') !== 'false', // 기본값 true
        aisIP : localStorage.getItem('aisIP') || 'localhost',
        aisWSPort: parseInt(localStorage.getItem('aisWSPort')) || 7410,
        aisPort: parseInt(localStorage.getItem('aisPort')) || 7400,
        radarIP : localStorage.getItem('radarIP') || '10.10.20.181',
        radarWSPort: parseInt(localStorage.getItem('radarWSPort')) || 7100,
        radarPort: parseInt(localStorage.getItem('radarPort')) || 7300,
        radar1IP : localStorage.getItem('radar1IP') || '10.10.20.181',
        radar1WSPort: parseInt(localStorage.getItem('radar1WSPort')) || 7100,
        radar1Port: parseInt(localStorage.getItem('radar1Port')) || 7300,
        radar2IP : localStorage.getItem('radar2IP') || '10.10.20.182',
        radar2WSPort: parseInt(localStorage.getItem('radar2WSPort')) || 7100,
        radar2Port: parseInt(localStorage.getItem('radar2Port')) || 7300,
        externalApiIp: localStorage.getItem('externalApiIp') || '118.40.116.129',
        externalApiPort: parseInt(localStorage.getItem('externalApiPort')) || 24010,
        buildingGPS: {
            lat: parseFloat(localStorage.getItem('buildingLat')) || 35.1358,
            lon: parseFloat(localStorage.getItem('buildingLon')) || 129.07,
            heading: 0
        }
    },
    getters: {
        getRadarGPS(state) {
            return {
                lat: state.lat,
                lon: state.lon,
                heading: state.heading
            }
        },

        getMap(state) {
            return {
                showMap: state.showMap,
                mapOpacity: state.mapOpacity
            }
        },

        getAISIP(state) {
            return state.aisIP
        },

        getRadarIP(state) {
            return state.radarIP
        },

        getAISWSPort(state) {
            return state.aisWSPort
        },

        getAISPort(state) {
            return state.aisPort
        },

        getRadarWSPort(state) {
            return state.radarWSPort
        },

        getRadarPort(state) {
            return state.radarPort
        },
        getRadar1IP(state) {
            return state.radar1IP
        },
        getRadar1WSPort(state) {
            return state.radar1WSPort
        },
        getRadar1Port(state) {
            return state.radar1Port
        },
        getRadar2IP(state) {
            return state.radar2IP
        },
        getRadar2WSPort(state) {
            return state.radar2WSPort
        },
        getRadar2Port(state) {
            return state.radar2Port
        },

        getExternalApiIp(state) {
            return state.externalApiIp
        },

        getExternalApiPort(state) {
            return state.externalApiPort
        },

        getShowRadar(state) {
            return state.showRadar
        },
        getBuildingGPS(state) {
            return state.buildingGPS
        }
    },
    mutations: {
        setRadarSetting (state, payload) {
            state.lat = payload.lat;
            state.lon = payload.lon;
            state.heading = payload.heading;
            state.showMap = payload.showMap;
            state.mapOpacity = payload.mapOpacity;
            state.crashDistance = payload.crashDistance
        },
        setIPSetting (state, payload) {
            state.aisIP = payload.aisIP;
            state.aisWSPort = payload.aisWSPort;
            state.aisPort = payload.aisPort;
            state.radarIP = payload.radarIP;
            state.radarPort = payload.radarPort;
            state.radarWSPort = payload.radarWSPort;

            // 레이더1, 레이더2 설정
            if (payload.radar1IP !== undefined) {
                state.radar1IP = payload.radar1IP;
                state.radar1Port = payload.radar1Port;
                state.radar1WSPort = payload.radar1WSPort;
                localStorage.setItem('radar1IP', payload.radar1IP);
                localStorage.setItem('radar1Port', String(payload.radar1Port));
                localStorage.setItem('radar1WSPort', String(payload.radar1WSPort));
            }
            if (payload.radar2IP !== undefined) {
                state.radar2IP = payload.radar2IP;
                state.radar2Port = payload.radar2Port;
                state.radar2WSPort = payload.radar2WSPort;
                localStorage.setItem('radar2IP', payload.radar2IP);
                localStorage.setItem('radar2Port', String(payload.radar2Port));
                localStorage.setItem('radar2WSPort', String(payload.radar2WSPort));
            }

            localStorage.setItem('aisIP', payload.aisIP);
            localStorage.setItem('aisPort', String(payload.aisPort));
            localStorage.setItem('aisWSPort', String(payload.aisWSPort));
            localStorage.setItem('radarIP', payload.radarIP);
            localStorage.setItem('radarPort', String(payload.radarPort));
            localStorage.setItem('radarWSPort', String(payload.radarWSPort));

            store.dispatch("disconnectAISSocket");
        },
        setExternalApiSetting (state, payload) {
            state.externalApiIp = payload.externalApiIp;
            state.externalApiPort = payload.externalApiPort;
            localStorage.setItem('externalApiIp', payload.externalApiIp);
            localStorage.setItem('externalApiPort', String(payload.externalApiPort));
        },
        setShowRadar (state, showRadar) {
            state.showRadar = showRadar;
            localStorage.setItem('showRadar', showRadar.toString());
        },
        setBuildingGPS (state, payload) {
            state.buildingGPS = payload || { lat: 35.1358, lon: 129.07, heading: 0 };
            localStorage.setItem('buildingLat', payload.lat.toString());
            localStorage.setItem('buildingLon', payload.lon.toString());
        }
    },
    actions: {
        async getRadarSetting({ commit }) {
            try {
                const res = await api.setting.getRadarSetting()
                commit("setRadarSetting", res.data)
                commit("setActGuardZone", res.data.guardZoneMode);
                commit("setActDetectZone", res.data.detectZoneMode);
                commit("setCrashDistance", res.data.crashDistance);
            }
            catch(err) {
                console.log("getRadarSetting Err: ",err)
            }
        },

        async updateSetting({ commit }, setting) {
            try {
                const res = await api.setting.updateSetting(setting)
                commit("setRadarSetting", res.data);
                commit("setActGuardZone", res.data.guardZoneMode);
                commit("setActDetectZone", res.data.detectZoneMode);
                commit("setCrashDistance", res.data.crashDistance);
                return res.data
            } catch(err) {
                console.log("updateSetting err:", err);
            }
        },

        async setIPSetting({ commit, dispatch }, payload) {
            commit("setIPSetting", payload);

            // 기존 데이터 초기화 (IP 변경 시 이전 장비 데이터 잔류 방지)
            commit("setAISData", []);
            commit("setRadar1Data", null);
            commit("setRadar2Data", null);

            dispatch("disconnectAISSocket");
            dispatch("connectAISSocket");

            // 레이더 소켓 모두 끊기
            dispatch("disconnectRadarSocket", 1);
            dispatch("disconnectRadarSocket", 2);

            // 레이더 소켓 다시 연결
            if (payload.radar1IP) {
                dispatch("connectRadarSocket", { radarIndex: 1 });
            }
            if (payload.radar2IP) {
                dispatch("connectRadarSocket", { radarIndex: 2 });
            }

            // URL 형식으로 변환하여 전달 (기본 레이더1 사용)
            const radarUrl = `http://${payload.radar1IP || payload.radarIP}:${payload.radar1Port || payload.radarPort}/`;
            const aisUrl = `http://${payload.aisIP}:${payload.aisPort}/`;
            config.setApiBaseUrl(radarUrl);
            config.setAISBaseUrl(aisUrl);
        },

        async setExternalApiSetting({ commit }, payload) {
            try {
                const res = await api.setting.updateExternalApiConfig({
                    ip: payload.externalApiIp,
                    port: payload.externalApiPort
                });
                commit("setExternalApiSetting", {
                    externalApiIp: res.data.ip,
                    externalApiPort: res.data.port
                });
                return res.data;
            } catch(err) {
                console.log("setExternalApiSetting err:", err);
            }
        },

        async getExternalApiSetting({ commit }) {
            try {
                const res = await api.setting.getExternalApiConfig();
                commit("setExternalApiSetting", {
                    externalApiIp: res.data.ip,
                    externalApiPort: res.data.port
                });
                return res.data;
            } catch(err) {
                console.log("getExternalApiSetting err:", err);
            }
        },

        async getBuildingGPS({ commit }) {
            try {
                const res = await api.setting.getAISGPS();
                const gps = res.data || { lat: 35.1358, lon: 129.07, heading: 0 };
                commit("setBuildingGPS", gps);
                return gps;
            } catch (err) {
                console.log("getBuildingGPS Err:", err);
                const defaultGPS = { lat: 35.1358, lon: 129.07, heading: 0 };
                commit("setBuildingGPS", defaultGPS);
                return defaultGPS;
            }
        },

        async setBuildingGPS({ commit }, gps) {
            try {
                const res = await api.setting.setAISGPS(gps);
                commit("setBuildingGPS", gps);
                return res.data;
            } catch (err) {
                console.log("setBuildingGPS Err:", err);
                throw err;
            }
        }
    },
};
