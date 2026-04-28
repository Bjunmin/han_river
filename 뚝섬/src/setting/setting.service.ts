import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './entities/setting.entity';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';

@Injectable()
export class SettingService {
    private readonly logger = new Logger(SettingService.name);

    constructor(
        @InjectRepository(Setting)
        private readonly settingRepository: Repository<Setting>,
        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache
    ) { }

    /**
     * 외부 API IP/Port 가져오기 (캐시 우선)
     */
    async getExternalApiConfig(): Promise<{ ip: string; port: number }> {
        const cacheKey = 'setting:externalApi';

        // 캐시에서 먼저 조회
        const cached = await this.cacheManager.get<{ ip: string; port: number }>(cacheKey);
        if (cached) {
            return cached;
        }

        // 캐시에 없으면 DB에서 조회
        const setting = await this.settingRepository.findOne({
            where: {},
            order: { id: 'DESC' }
        });

        if (!setting) {
            // 기본값 반환
            const defaultConfig = {
                ip: '118.40.116.129',
                port: 24010
            };
            await this.cacheManager.set(cacheKey, defaultConfig, 60 * 60 * 1000); // 1시간 캐시
            return defaultConfig;
        }

        const config = {
            ip: setting.externalApiIp || '118.40.116.129',
            port: setting.externalApiPort || 24010
        };

        // 캐시에 저장 (1시간)
        await this.cacheManager.set(cacheKey, config, 60 * 60 * 1000);

        return config;
    }

    /**
     * 외부 API IP/Port 설정
     */
    async setExternalApiConfig(ip: string, port: number) {
        // 기존 설정이 있으면 업데이트, 없으면 생성
        let setting = await this.settingRepository.findOne({
            where: {},
            order: { id: 'DESC' }
        });

        if (!setting) {
            setting = this.settingRepository.create({
                externalApiIp: ip,
                externalApiPort: port
            });
        } else {
            setting.externalApiIp = ip;
            setting.externalApiPort = port;
        }

        await this.settingRepository.save(setting);

        // 캐시 갱신
        const cacheKey = 'setting:externalApi';
        await this.cacheManager.set(cacheKey, { ip, port }, 60 * 60 * 1000);

        return {
            ip,
            port
        };
    }

    /**
     * AIS 통신 설정 가져오기 (캐시 우선)
     */
    async getAISCommunicationConfig(): Promise<{
        type: number;
        serialPorts: string[];
        serialPort?: string;
        tcpIp?: string;
        tcpPort?: number;
    }> {
        const cacheKey = 'setting:aisCommunication';

        const cached = await this.cacheManager.get(cacheKey);
        if (cached) {
            return cached as any;
        }

        const setting = await this.settingRepository.findOne({
            where: {},
            order: { id: 'DESC' }
        });

        if (!setting) {
            const defaultConfig = {
                type: 0,
                serialPorts: [],
                serialPort: null,
                tcpIp: '127.0.0.1',
                tcpPort: 4001
            };
            await this.cacheManager.set(cacheKey, defaultConfig, 60 * 60 * 1000);
            return defaultConfig;
        }

        // aisSerialPorts(JSON 배열) 파싱, 없으면 aisSerialPort 단일값으로 폴백
        let serialPorts: string[] = [];
        if (setting.aisSerialPorts) {
            try { serialPorts = JSON.parse(setting.aisSerialPorts); } catch {}
        }
        if (serialPorts.length === 0 && setting.aisSerialPort) {
            serialPorts = [setting.aisSerialPort];
        }
        // 설정된 포트가 없으면 빈 배열 유지 (서버가 임의 포트 연결하지 않도록)

        const config = {
            type: setting.aisCommunicationType ?? 0,
            serialPorts,
            serialPort: serialPorts[0],
            tcpIp: setting.aisTcpIp || '127.0.0.1',
            tcpPort: setting.aisTcpPort || 4001
        };

        await this.cacheManager.set(cacheKey, config, 60 * 60 * 1000);
        return config;
    }

    /**
     * AIS 통신 설정 저장
     */
    async setAISCommunicationConfig(
        config: {
            type: number;
            serialPorts?: string[];
            serialPort?: string;
            tcpIp?: string;
            tcpPort?: number;
        },
        aisService?: any
    ) {
        let setting = await this.settingRepository.findOne({
            where: {},
            order: { id: 'DESC' }
        });

        // serialPorts 배열 정규화: 배열이 없으면 serialPort 단일값으로 구성
        const serialPorts = config.serialPorts?.length > 0
            ? config.serialPorts
            : (config.serialPort ? [config.serialPort] : []);

        if (!setting) {
            setting = this.settingRepository.create({
                aisCommunicationType: config.type,
                aisSerialPort: serialPorts[0] || null,
                aisSerialPorts: serialPorts.length > 0 ? JSON.stringify(serialPorts) : null,
                aisTcpIp: config.tcpIp,
                aisTcpPort: config.tcpPort
            });
        } else {
            setting.aisCommunicationType = config.type;
            if (serialPorts.length > 0) {
                setting.aisSerialPort = serialPorts[0];
                setting.aisSerialPorts = JSON.stringify(serialPorts);
            }
            if (config.tcpIp) setting.aisTcpIp = config.tcpIp;
            if (config.tcpPort) setting.aisTcpPort = config.tcpPort;
        }

        await this.settingRepository.save(setting);

        // 캐시 갱신 (정규화된 값으로)
        const cacheKey = 'setting:aisCommunication';
        const normalizedConfig = {
            ...config,
            serialPorts,
            serialPort: serialPorts[0] || config.serialPort,
        };
        await this.cacheManager.set(cacheKey, normalizedConfig, 60 * 60 * 1000);

        const response = { success: true, message: '통신 설정이 변경되었습니다.' };

        if (aisService) {
            aisService.reloadCommunicationConfig().catch((error) => {
                console.error('AIS 통신 재연결 실패:', error);
            });
        }

        return response;
    }

    /**
     * 시리얼 포트 목록 조회
     */
    async getSerialPorts(): Promise<string[]> {
        try {
            const { SerialPort } = await import('serialport');
            const ports = await SerialPort.list();
            return ports.map(port => port.path);
        } catch (error) {
            this.logger.error('시리얼 포트 목록 조회 실패:', error);
            return [];
        }
    }

    /**
     * AIS GPS 정보 가져오기 (캐시 우선) - 지도 중심 좌표로 사용
     */
    async getAISGPS(): Promise<{ lat: number; lon: number }> {
        const cacheKey = 'setting:aisGPS';

        // 캐시에서 먼저 조회
        const cached = await this.cacheManager.get<{ lat: number; lon: number }>(cacheKey);
        if (cached) {
            return cached;
        }

        // 캐시에 없으면 DB에서 조회
        const setting = await this.settingRepository.findOne({
            where: {},
            order: { id: 'DESC' }
        });

        if (!setting) {
            // 기본값 반환
            const defaultGPS = {
                lat: 35.1358,
                lon: 129.07
            };
            await this.cacheManager.set(cacheKey, defaultGPS, 60 * 60 * 1000); // 1시간 캐시
            return defaultGPS;
        }

        const gps = {
            lat: setting.aisLatitude !== null && setting.aisLatitude !== undefined ? setting.aisLatitude : 35.1358,
            lon: setting.aisLongitude !== null && setting.aisLongitude !== undefined ? setting.aisLongitude : 129.07
        };

        // 캐시에 저장 (1시간)
        await this.cacheManager.set(cacheKey, gps, 60 * 60 * 1000);

        return gps;
    }

    /**
     * AIS GPS 정보 설정 - 지도 중심 좌표로 사용 (heading 제거)
     */
    async setAISGPS(lat: number, lon: number) {
        // 기존 설정이 있으면 업데이트, 없으면 생성
        let setting = await this.settingRepository.findOne({
            where: {},
            order: { id: 'DESC' }
        });

        if (!setting) {
            setting = this.settingRepository.create({
                aisLatitude: lat,
                aisLongitude: lon
            });
        } else {
            setting.aisLatitude = lat;
            setting.aisLongitude = lon;
            // heading은 더 이상 저장하지 않음
        }

        await this.settingRepository.save(setting);

        // 캐시 갱신
        const cacheKey = 'setting:aisGPS';
        await this.cacheManager.set(cacheKey, { lat, lon }, 60 * 60 * 1000);

        return {
            lat,
            lon
        };
    }
}

