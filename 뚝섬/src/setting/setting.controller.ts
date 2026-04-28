import { Controller, Get, Patch, Body, Inject, forwardRef } from '@nestjs/common';
import { SettingService } from './setting.service';
import { AisService } from 'src/ais/ais.service';

@Controller('setting')
export class SettingController {
    constructor(
        private readonly settingService: SettingService,
        @Inject(forwardRef(() => AisService))
        private readonly aisService: AisService
    ) { }

    @Get('external-api')
    async getExternalApiConfig() {
        return this.settingService.getExternalApiConfig();
    }

    @Patch('external-api')
    async updateExternalApiConfig(
        @Body() body: { ip: string; port: number }
    ) {
        return this.settingService.setExternalApiConfig(body.ip, body.port);
    }

    @Get('ais-communication')
    async getAISCommunicationConfig() {
        return this.settingService.getAISCommunicationConfig();
    }

    @Patch('ais-communication')
    async updateAISCommunicationConfig(
        @Body() body: {
            type: number;
            serialPorts?: string[];
            serialPort?: string;
            tcpIp?: string;
            tcpPort?: number;
        }
    ) {
        console.log("ais-communication", body);
        return this.settingService.setAISCommunicationConfig(body, this.aisService);
    }

    @Get('serial-ports')
    async getSerialPorts() {
        return this.settingService.getSerialPorts();
    }

    @Get('ais-communication-status')
    async getAISCommunicationStatus() {
        return this.aisService.getCommunicationStatus();
    }

    @Get('ais-gps')
    async getAISGPS() {
        return this.settingService.getAISGPS();
    }

    @Patch('ais-gps')
    async updateAISGPS(
        @Body() body: { lat: number; lon: number }
    ) {
        return this.settingService.setAISGPS(body.lat, body.lon);
    }
}

