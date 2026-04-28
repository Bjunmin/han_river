import { getAisBaseUrl } from "../config";
import service from "../service";

export default {
    async getAISDateBetweenDate(param) {
        const response = await service.get(
            `${getAisBaseUrl()}ais/date`, param
        );
        return response
    },

    async getAllAISData() {
        const response = await service.get(
            `${getAisBaseUrl()}ais`
        );
        return response
    },

    async getAISCommunicationConfig() {
        const response = await service.get(
            `${getAisBaseUrl()}setting/ais-communication`
        );
        return response;
    },

    async updateAISCommunicationConfig(config) {
        const response = await service.patch(
            `${getAisBaseUrl()}setting/ais-communication`,
            config
        );
        return response;
    },

    async getSerialPorts() {
        const response = await service.get(
            `${getAisBaseUrl()}setting/serial-ports`
        );
        return response;
    },

    async getAISCommunicationStatus() {
        const response = await service.get(
            `${getAisBaseUrl()}setting/ais-communication-status`
        );
        return response;
    }
};
