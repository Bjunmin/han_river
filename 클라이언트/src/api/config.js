export const API_URL = "http://";

const ip = "localhost"

// han_river_server 통합 (HTTP 7400 / WS 7410)
let apiBaseUrl = `http://${ip}:7400/`
let aisBaseUrl = `http://${ip}:7400/`

export const getApiBaseUrl = () => {
    return apiBaseUrl;
};

export const getAisBaseUrl = () => {
    return aisBaseUrl;
}

export const setAISBaseUrl = (newUrl) => {
    aisBaseUrl = newUrl;
};

export default {
    ip,
    setAISBaseUrl,
    getApiBaseUrl,
    getAisBaseUrl
}