import { getAisBaseUrl } from "../config";
import service from "../service";

export default {
    async updateExternalApiConfig(config) {
        const response = await service.patch(
            `${getAisBaseUrl()}setting/external-api`, config
        )
        return response
    },

    async getExternalApiConfig() {
        const response = await service.get(
            `${getAisBaseUrl()}setting/external-api`
        )
        return response
    },

    async getAISGPS() {
        const response = await service.get(
            `${getAisBaseUrl()}setting/ais-gps`
        )
        return response
    },

    async setAISGPS(gps) {
        const response = await service.patch(
            `${getAisBaseUrl()}setting/ais-gps`,
            gps
        )
        return response
    },
};
