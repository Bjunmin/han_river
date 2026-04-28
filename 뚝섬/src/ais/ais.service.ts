import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SerialPort } from 'serialport';
import AisDecoder from 'ais-stream-decoder';
import * as net from 'net';

import { Cron } from "@nestjs/schedule";
import { ConfigService } from '@nestjs/config';
import { AIS } from './entities/ais.entity';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { AISHistory } from './entities/ais.history.entity';
import { AISStatic } from './entities/ais-static.entity';
import { AISDetection } from './entities/ais.detection.entity';
import { AisGateway } from './ais.gateway';
import { SettingService } from 'src/setting/setting.service';
import { Setting } from 'src/setting/entities/setting.entity';
import { ErrorLoggerService } from 'src/common/logger/error-logger.service';
import { envVariableKeys } from 'src/common/const/env.const';
import {
  describeMode,
  getCapabilities,
  resolveSiteMode,
  SiteCapabilities,
  SiteMode,
} from 'src/common/const/site-mode.const';
import { CentralClientService } from './central-client.service';

@Injectable()
export class AisService implements OnModuleInit, OnModuleDestroy {
  // ==================== 클래스 변수 및 상수 ====================
  // 시리얼 포트: 포트 경로 → {SerialPort, AisDecoder, messageBuffer}
  private portStates = new Map<string, { serialPort: SerialPort; decoder: AisDecoder; messageBuffer: string }>();
  // TCP
  private tcpClient: net.Socket | null = null;
  private tcpDecoder: AisDecoder | null = null;
  private tcpMessageBuffer: string = '';

  private communicationType: number = 0; // 0: serial, 1: tcp
  private pointHistory = new Map();
  private aisHisotry = [];

  // AIS 데이터 전송 간격 제어
  private lastAisDataSendTime: number = 0;
  private aisDataSendTimer: NodeJS.Timeout | null = null;
  private readonly AIS_SEND_INTERVAL = 5000;

  // 동일 MMSI 동시 처리 방지 (await 지점에서 이벤트 루프 양보 시 중복 진입 차단)
  private processingMMSI = new Set<string>();

  // 중복 수신 필터: 동일 MMSI가 DEDUP_WINDOW_MS 이내에 재수신되면 skip
  private mmsiLastReceived = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 3000;

  // ==================== 재연결 관리 ====================
  // key: 'tcp' 또는 portPath(시리얼)
  private reconnectTimeouts = new Map<string, NodeJS.Timeout>();
  // 의도적으로 close한 포트 경로 (재연결 스킵)
  private intentionallyClosedPaths = new Set<string>();

  // 재연결 시도 횟수 (exp backoff 인덱스용). 성공 시 0 으로 초기화.
  private reconnectAttempts = new Map<string, number>(); // key: portPath | 'tcp'
  // 시리얼 재연결 exp backoff 시퀀스 (초): 3, 6, 12, 24, 60, 120, 300
  private readonly SERIAL_BACKOFF_MS = [3000, 6000, 12000, 24000, 60000, 120000, 300000];
  private readonly TCP_BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];
  // 각 포트의 마지막 유효 데이터 수신 시각 (drought watchdog 용)
  private portLastDataAt = new Map<string, number>(); // key: portPath | 'tcp'
  // drought watchdog 주기 (15초)
  private droughtTimer: NodeJS.Timeout | null = null;
  // drought 임계값 (env 로 조정 가능, default 120s)
  private droughtMs: number = 120_000;
  // 시리얼 포트 physical 존재 여부 확인 실패 연속 카운트 (로그 스팸 방지용)
  private portMissCount = new Map<string, number>();

  private isDeviceConnected: boolean = false;
  private lastDataReceivedTime: number = 0;
  private readonly DATA_TIMEOUT_MS = 2 * 60 * 1000;
  private dataTimeoutTimer: NodeJS.Timeout | null = null;

  // ==================== 분산 운영 모드 ====================
  // SITE_MODE env 에서 유도한 capability 플래그들 (onModuleInit 에서 채워짐)
  private siteMode: SiteMode = 'standalone';
  private siteName: string = '로컬';
  private cap: SiteCapabilities = getCapabilities('standalone');

  // source 태그: 최근 5분 이내 어느 엣지에서 데이터가 들어왔는지 추적
  private readonly ACTIVE_SOURCE_TTL_MS = 5 * 60 * 1000;
  private activeSourcesByMmsi = new Map<string, Map<string, number>>(); // mmsi → (source → lastSeen)

  // ==================== 생성자 및 초기화 ====================
  constructor(
    @InjectRepository(AIS)
    private readonly aisRepository: Repository<AIS>,
    @InjectRepository(AISHistory)
    private readonly aisHistoryRepository: Repository<AISHistory>,
    @InjectRepository(AISStatic)
    private readonly aisStaticRepository: Repository<AISStatic>,
    @InjectRepository(AISDetection)
    private readonly aisDetectionRepository: Repository<AISDetection>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,

    private readonly aisGateway: AisGateway,
    private readonly settingService: SettingService,
    private readonly logger: ErrorLoggerService,
    private readonly configService: ConfigService,
    private readonly centralClient: CentralClientService,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache

  ) { }

  async onModuleInit() {
    // ---- 1) SITE_MODE 확정 ----
    this.siteMode = resolveSiteMode(this.configService.get<string>(envVariableKeys.siteMode));
    this.siteName = (this.configService.get<string>(envVariableKeys.siteName) ?? '로컬').trim();
    this.cap = getCapabilities(this.siteMode);

    // drought 임계값 로드 (기본 120s)
    const rawDrought = parseInt(this.configService.get<string>(envVariableKeys.serialDroughtMs) ?? '', 10);
    if (Number.isFinite(rawDrought) && rawDrought >= 10_000) {
      this.droughtMs = rawDrought;
    }

    const centralWsUrl = this.configService.get<string>(envVariableKeys.centralWsUrl) ?? null;
    this.logger.structured('info', 'AisService', 'mode_resolved',
      describeMode(this.siteMode, this.siteName, centralWsUrl));

    // ---- 2) 시리얼/TCP 로컬 수신 활성화 (serialEnabled 때만) ----
    if (this.cap.serialEnabled) {
      await this.loadCommunicationConfig();
      this.startDroughtWatchdog();
    } else {
      this.logger.structured('info', 'AisService', 'serial_disabled', { mode: this.siteMode });
    }

    // ---- 3) 기동 시 DB 캐시 로드 (dbEnabled 때만) ----
    if (this.cap.dbEnabled) {
      await this.loadRecentAISDataFromDB();
    }
  }

  /**
   * 서버 시작 시: DB에서 최근 10분 이내 AIS 데이터 로드 및 클라이언트 전송
   */
  private async loadRecentAISDataFromDB(): Promise<void> {
    try {
      const tenMinuteAgo = new Date(Date.now() - 10 * 60000); // 10분 전

      // DB에서 최근 10분 이내의 AIS 데이터 조회
      const recentAisData = await this.aisRepository
        .createQueryBuilder('ais')
        .where('ais.updatedAt >= :tenMinuteAgo', { tenMinuteAgo })
        .orderBy('ais.updatedAt', 'DESC')
        .getMany();

      if (recentAisData.length === 0) {
        this.logger.log('서버 시작: 최근 10분 이내 AIS 데이터 없음');
        return;
      }

      this.logger.log(`서버 시작: 최근 10분 이내 AIS 데이터 ${recentAisData.length}개 로드 시작`);

      // 각 AIS 데이터를 메모리 구조로 변환
      for (const ais of recentAisData) {
        if (!ais.lat || !ais.lon) continue;

        // 거리 계산
        const distance = await this.calculateDistanceFromCenter(ais.lat, ais.lon);
        const roundedDistance = Math.round(distance * 100) / 100;

        // 정적 정보 가져오기
        const staticInfo = await this.getStaticInfo(ais.mmsi);
        const name = staticInfo.name || ais.name || 'No name';

        // updatedAt을 timestamp로 변환
        const timestamp = ais.updatedAt ? new Date(ais.updatedAt).getTime() : Date.now();

        const point = {
          lat: Number(ais.lat),
          lon: Number(ais.lon),
          mmsi: String(ais.mmsi), // MMSI를 문자열로 통일
          distance: roundedDistance,
          cog: ais.cog ? Number(ais.cog) : null,
          sog: ais.sog ? Number(ais.sog) : 0,
          hdg: ais.hdg ? Number(ais.hdg) : null,
          nav_status: ais.nav_status || null,
          rot: ais.rot || null,
          heading: ais.hdg ? Number(ais.hdg) : null,
          timestamp: timestamp,
          name: name
        };

        // pointHistory에 추가 (최신 데이터만)
        const history = [point, point]; // 최소 2개 필요
        this.pointHistory.set(String(ais.mmsi), history); // MMSI를 문자열로 통일
      }

      // 클라이언트에게 전송 (서버 시작 시 즉시 전송 - 디바이스 연결 여부 무관)
      this.sendAisData(true, true); // force = true, ignoreDeviceCheck = true
      this.logger.log(`서버 시작: AIS 데이터 로드 완료 및 클라이언트 전송 (${recentAisData.length}개)`);
    } catch (error: any) {
      this.logger.error('서버 시작 시 AIS 데이터 로드 실패:', { message: error.message });
    }
  }

  /**
   * 통신 설정 로드 및 연결
   */
  async loadCommunicationConfig() {
    this.cancelAllReconnectTimers();

    try {
      const config = await this.settingService.getAISCommunicationConfig();
      this.communicationType = config.type ?? 0;

      if (this.communicationType === 1) {
        try {
          await this.connectTcp(config.tcpIp || '127.0.0.1', config.tcpPort || 4001);
        } catch (tcpError) {
          this.logger.error('TCP 연결 실패, 재연결 시도 예정:', { message: tcpError.message });
          this.scheduleReconnect('tcp', 10000);
        }
      } else {
        // 시리얼: 설정된 모든 포트에 연결 (각각 독립적으로)
        const ports = config.serialPorts?.length > 0
          ? config.serialPorts
          : (config.serialPort ? [config.serialPort] : []);

        for (const portPath of ports) {
          this.connectSerialPort(portPath); // 비동기, 실패해도 다음 포트 계속
        }
      }
    } catch (error) {
      this.logger.error('통신 설정 로드 실패:', { error });
    }
  }

  /**
   * 특정 키의 재연결 타이머 취소
   */
  private cancelReconnectTimer(key: string) {
    const existing = this.reconnectTimeouts.get(key);
    if (existing) {
      clearTimeout(existing);
      this.reconnectTimeouts.delete(key);
    }
  }

  /**
   * 모든 재연결 타이머 취소
   */
  private cancelAllReconnectTimers() {
    this.reconnectTimeouts.forEach((t) => clearTimeout(t));
    this.reconnectTimeouts.clear();
  }

  /**
   * 재연결 스케줄링 (exp backoff)
   *  - type='serial': SERIAL_BACKOFF_MS 시퀀스 [3,6,12,24,60,120,300]s
   *  - type='tcp':    TCP_BACKOFF_MS 시퀀스    [5,10,20,40,60]s
   *  - 성공하면 resetReconnectAttempts(key) 로 인덱스 초기화
   * @param type 'tcp' | 'serial'
   * @param portPath 시리얼 포트 경로 (serial 타입 시 필수)
   */
  private scheduleReconnect(type: 'tcp' | 'serial', _legacyDelay: number = 0, portPath?: string) {
    const key = type === 'tcp' ? 'tcp' : portPath;
    if (!key) return;

    if (this.reconnectTimeouts.has(key)) return; // 이미 예약됨
    if (this.intentionallyClosedPaths.has(key)) return; // 의도적 종료

    if (type === 'tcp' && this.communicationType !== 1) return;
    if (type === 'serial' && this.communicationType !== 0) return;

    const attempt = this.reconnectAttempts.get(key) ?? 0;
    const seq = type === 'serial' ? this.SERIAL_BACKOFF_MS : this.TCP_BACKOFF_MS;
    const delay = seq[Math.min(attempt, seq.length - 1)];
    this.reconnectAttempts.set(key, attempt + 1);

    this.logger.structured('info', 'Serial', 'reconnect_scheduled', {
      type,
      key,
      attempt: attempt + 1,
      delayMs: delay,
    });

    const timeout = setTimeout(async () => {
      this.reconnectTimeouts.delete(key);
      try {
        if (type === 'tcp' && this.communicationType === 1) {
          const config = await this.settingService.getAISCommunicationConfig();
          await this.connectTcp(config.tcpIp || '127.0.0.1', config.tcpPort || 4001);
        } else if (type === 'serial' && this.communicationType === 0) {
          // physical check (로그만, 실제 열기는 그대로 시도)
          await this.logSerialPortPresence(portPath);
          this.connectSerialPort(portPath);
        }
      } catch (error: any) {
        this.logger.structured('warn', 'Serial', 'reconnect_fail', {
          type,
          key,
          attempt: attempt + 1,
          error: error?.message,
        });
        this.scheduleReconnect(type, 0, portPath);
      }
    }, delay);

    this.reconnectTimeouts.set(key, timeout);
  }

  /** 재연결 카운터 초기화 (연결 성공 시 호출) */
  private resetReconnectAttempts(key: string) {
    this.reconnectAttempts.delete(key);
    this.portMissCount.delete(key);
  }

  /** SerialPort.list() 로 포트가 실제 존재하는지 체크하고 로그 */
  private async logSerialPortPresence(portPath: string) {
    if (!portPath) return;
    try {
      const ports = await SerialPort.list();
      const exists = ports.some((p) => p.path === portPath);
      if (!exists) {
        const miss = (this.portMissCount.get(portPath) ?? 0) + 1;
        this.portMissCount.set(portPath, miss);
        // 로그 스팸 방지: 1, 3, 10회마다만 로그
        if (miss === 1 || miss === 3 || miss % 10 === 0) {
          this.logger.structured('warn', 'Serial', 'port_not_present', {
            portPath,
            consecutiveMiss: miss,
            availablePorts: ports.map((p) => p.path),
          });
        }
      } else {
        if (this.portMissCount.has(portPath)) {
          this.logger.structured('info', 'Serial', 'port_reappeared', { portPath });
        }
        this.portMissCount.delete(portPath);
      }
    } catch (err: any) {
      this.logger.structured('warn', 'Serial', 'list_fail', { error: err?.message });
    }
  }

  /**
   * 15초마다 실행: 열린 포트 중 drought (droughtMs 이상 데이터 없음) 면 강제 재접속.
   * TCP 도 동일 원칙.
   */
  private startDroughtWatchdog() {
    if (this.droughtTimer) clearInterval(this.droughtTimer);
    this.droughtTimer = setInterval(() => {
      const now = Date.now();
      // serial
      if (this.communicationType === 0) {
        for (const [path, state] of this.portStates.entries()) {
          if (!state.serialPort.isOpen) continue;
          const last = this.portLastDataAt.get(path) ?? 0;
          if (last === 0) {
            // 아직 첫 데이터 없음 → grace period: 포트가 열린 후 droughtMs 만큼은 봐준다.
            // state 에 openedAt 이 없으므로 여기서 last=0 이면 last 를 now 로 초기화 해놓음.
            this.portLastDataAt.set(path, now);
            continue;
          }
          const silentMs = now - last;
          if (silentMs > this.droughtMs) {
            this.logger.structured('warn', 'Serial', 'drought_detected', {
              portPath: path,
              silentMs,
              droughtMs: this.droughtMs,
            });
            // 의도된 종료가 아니므로 close 후 자연스럽게 reconnect
            try { state.serialPort.close(); } catch { /* noop */ }
            this.portLastDataAt.delete(path);
          }
        }
      }
      // tcp
      if (this.communicationType === 1 && this.tcpClient) {
        const last = this.portLastDataAt.get('tcp') ?? 0;
        if (last === 0) {
          this.portLastDataAt.set('tcp', now);
        } else if (now - last > this.droughtMs) {
          this.logger.structured('warn', 'Serial', 'tcp_drought_detected', {
            silentMs: now - last,
            droughtMs: this.droughtMs,
          });
          try { this.tcpClient.destroy(); } catch { /* noop */ }
          this.portLastDataAt.delete('tcp');
        }
      }
    }, 15_000);
  }

  // ==================== 시리얼 포트 관련 ====================
  connectSerialPort(portPath: string) {
    // 이 포트의 재연결 타이머 취소
    this.cancelReconnectTimer(portPath);

    // 같은 경로의 기존 포트가 있으면 정리
    const existing = this.portStates.get(portPath);
    if (existing) {
      this.intentionallyClosedPaths.add(portPath);
      existing.serialPort.removeAllListeners();
      existing.serialPort.on('error', () => {});
      if (existing.serialPort.isOpen) existing.serialPort.close();
      existing.decoder.removeAllListeners();
      this.portStates.delete(portPath);
    }

    const decoder = this.createDecoder();
    const sp = new SerialPort({ path: portPath, baudRate: 38400, autoOpen: false });
    this.portStates.set(portPath, { serialPort: sp, decoder, messageBuffer: '' });
    this.bindSerialPortEvents(portPath);

    sp.open((err) => {
      if (err) {
        this.logger.log(`Serial open failed (${portPath}), retry in 10s...`, { message: err.message });
        this.portStates.delete(portPath);
        if (this.communicationType === 0) {
          this.scheduleReconnect('serial', 10000, portPath);
        }
      }
    });
  }

  /**
   * AisDecoder 인스턴스 생성 (데이터/에러 핸들러 등록 포함)
   */
  private createDecoder(): AisDecoder {
  const decoder = new AisDecoder();
  decoder.on('error', (err: any) => {
    this.logger.error('Decode ERROR:', { error: err?.message ?? String(err) });
    // ais-stream-decoder 의 Transform stream 은 error 나면 destroy 됨.
    // 따라서 해당 decoder 를 쓰는 포트를 닫아서 reconnect → 새 decoder 로 살려냄.
    for (const [path, state] of this.portStates.entries()) {
      if (state.decoder === decoder) {
        this.logger.structured('warn', 'Serial', 'decoder_dead_recycling', { portPath: path });
        try { state.serialPort.close(); } catch { /* noop */ }
        return;
      }
    }
    if (this.tcpDecoder === decoder) {
      this.logger.structured('warn', 'Serial', 'tcp_decoder_dead_recycling', {});
      try { this.tcpClient?.destroy(); } catch { /* noop */ }
    }
  });
  decoder.on('data', (decodedMessage) => {
    this.saveAISData(JSON.parse(decodedMessage));
  });
  return decoder;
}

  // ==================== TCP 통신 관련 ====================
  async connectTcp(ip: string, port: number) {
    this.cancelAllReconnectTimers();

    // 모든 시리얼 포트 닫기
    for (const [path, state] of this.portStates.entries()) {
      this.intentionallyClosedPaths.add(path);
      state.serialPort.removeAllListeners();
      state.serialPort.on('error', () => {});
      if (state.serialPort.isOpen) state.serialPort.close();
      state.decoder.removeAllListeners();
    }
    this.portStates.clear();

    // 기존 TCP 연결 닫기
    if (this.tcpClient) {
      this.tcpClient.removeAllListeners();
      this.tcpClient.on('error', (err) => {
        this.logger.error('TCP 연결 오류', { message: err.message });
      });
      this.tcpClient.destroy();
      this.tcpClient = null;
    }

    // TCP 전용 디코더/버퍼 초기화
    if (this.tcpDecoder) this.tcpDecoder.removeAllListeners();
    this.tcpDecoder = this.createDecoder();
    this.tcpMessageBuffer = '';

    return new Promise<void>((resolve, reject) => {
      const client = new net.Socket();
      this.tcpClient = client;

      // 연결 타임아웃 설정 (5초)
      const connectionTimeout = setTimeout(() => {
        if (this.tcpClient === client) {
          this.tcpClient = null;
        }
        client.destroy();
        const error = new Error(`TCP connection timeout to ${ip}:${port}`);
        this.logger.error(error.message);
        reject(error);
      }, 5000);

      let isResolved = false;

      client.connect(port, ip, () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(connectionTimeout);
          this.logger.log(`TCP Connected to ${ip}:${port}`);
          this.isDeviceConnected = true;
          this.resetReconnectAttempts('tcp');
          this.portLastDataAt.set('tcp', Date.now());
          this.aisGateway.broadcastDeviceStatus(true);

          // 연결 성공 후 keepAlive 및 타임아웃 설정
          client.setKeepAlive(true, 10000); // 10초마다 OS 레벨 keepalive 패킷 전송
          client.setTimeout(30000);         // 30초간 데이터 없으면 timeout 이벤트 발생

          resolve();
        }
      });

      client.on('timeout', () => {
        this.logger.warn(`TCP 타임아웃 (${ip}:${port}) - 연결 강제 종료 후 재연결`);
        client.destroy(); // close 이벤트 발생 → 재연결 로직 실행
      });

      client.on('data', (data) => {
        this.onTcpData(data);
      });

      client.on('error', (err) => {
        clearTimeout(connectionTimeout);
        this.logger.error(`TCP Connection Error (${ip}:${port}):`, { message: err.message });
        // tcpClient를 여기서 null로 만들면 close 핸들러에서 재연결을 건너뜀
        // tcpClient 정리는 close 핸들러에서만 처리
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      });

      client.on('close', () => {
        clearTimeout(connectionTimeout);
        // 이 클라이언트가 현재 활성 연결인지 확인 (의도적 close인 경우 재연결하지 않음)
        if (this.tcpClient !== client) {
          // 이미 다른 연결로 교체되었거나 의도적으로 닫힌 경우
          return;
        }

        this.logger.log(`TCP Connection Closed (${ip}:${port}). Reconnecting in 10s...`);
        this.isDeviceConnected = false;
        this.aisGateway.broadcastDeviceStatus(false);
        this.tcpClient = null;

        // 재연결 요청 (단일 메서드에서 관리)
        this.scheduleReconnect('tcp', 10000);
      });
    });
  }

  private onTcpData(data: Buffer) {
    try {
      this.portLastDataAt.set('tcp', Date.now());
      const dataStr = data.toString();
      if (dataStr.indexOf('!') !== -1) {
        const isValid = /^!AIVD[MO],.*\*[0-9A-Fa-f]{2}\r?\n?$/.test(this.tcpMessageBuffer);
        if (this.tcpMessageBuffer !== '' && isValid) {
          try {
            this.tcpDecoder?.write(this.tcpMessageBuffer.trim());
          } catch (error) {
            this.logger.error('Error while decoding message: ', { error });
            this.tcpMessageBuffer = '';
          }
        }
        this.tcpMessageBuffer = '';
      }
      this.tcpMessageBuffer = this.tcpMessageBuffer + dataStr;
      if (this.tcpMessageBuffer.length > 1000) {
        this.logger.warn('[onTcpData] 메시지 버퍼 오버플로 감지, 리셋');
        this.tcpMessageBuffer = '';
      }
    } catch (error) {
      this.logger.error('Error processing TCP data: ', { error });
    }
  }

  private bindSerialPortEvents(portPath: string) {
    const state = this.portStates.get(portPath);
    if (!state) return;
    const { serialPort } = state;

    serialPort.on('data', (data) => this.onSerialData(portPath, data));

    serialPort.on('open', () => {
      this.logger.log(`Serial Port Opened: ${portPath}`);
      this.intentionallyClosedPaths.delete(portPath);
      this.resetReconnectAttempts(portPath);
      this.portLastDataAt.set(portPath, Date.now()); // grace period 시작
      if (!this.isDeviceConnected) {
        this.isDeviceConnected = true;
        this.aisGateway.broadcastDeviceStatus(true);
      }
    });

    serialPort.on('error', (err) => {
      this.logger.error(`Serial Port Error (${portPath}):`, { message: err.message });
    });

    serialPort.on('close', () => {
      this.portStates.delete(portPath);

      // 나머지 포트가 하나라도 연결 중이면 connected 유지
      const anyConnected = [...this.portStates.values()].some(ps => ps.serialPort.isOpen);
      if (!anyConnected && this.isDeviceConnected) {
        this.isDeviceConnected = false;
        this.aisGateway.broadcastDeviceStatus(false);
      }

      if (this.intentionallyClosedPaths.has(portPath)) {
        this.logger.log(`Serial Port Closed (intentional): ${portPath}`);
        this.intentionallyClosedPaths.delete(portPath);
        return;
      }

      this.logger.log(`Serial Port Closed (${portPath}). Reconnecting in 2s...`);
      if (this.communicationType === 0) {
        this.scheduleReconnect('serial', 2000, portPath);
      }
    });
  }

  private onSerialData(portPath: string, data: Buffer) {
    try {
      const state = this.portStates.get(portPath);
      if (!state) return;
      // drought watchdog 용: 유효/무효 상관없이 raw 바이트가 들어오면 살아있음으로 간주
      this.portLastDataAt.set(portPath, Date.now());
      const dataStr = data.toString();
      if (dataStr.indexOf('!') !== -1) {
        const isValid = /^!AIVD[MO],.*\*[0-9A-Fa-f]{2}\r?\n?$/.test(state.messageBuffer);
        if (state.messageBuffer !== '' && isValid) {
          try {
            state.decoder.write(state.messageBuffer.trim());
          } catch (error) {
            this.logger.error(`Error while decoding message (${portPath}):`, { error });
            state.messageBuffer = '';
          }
        }
        state.messageBuffer = '';
      }
      state.messageBuffer = state.messageBuffer + dataStr;
      if (state.messageBuffer.length > 1000) {
        this.logger.warn(`[onSerialData ${portPath}] 메시지 버퍼 오버플로 감지, 리셋`);
        state.messageBuffer = '';
      }
    } catch (error) {
      this.logger.error('Error processing serial data: ', { error });
    }
  }

  // ==================== AIS 데이터 처리 ====================
  /**
   * AIS decoder 또는 /ingest 에서 호출되는 진입점.
   * - 지역 시리얼에서 올라온 경우: source 없음 → this.siteName 으로 태깅
   * - 중앙 /ingest 에서 올라온 경우: payload 에 이미 source 가 박혀 있어야 함
   * - edge 모드: DB 저장 대신 CentralClient 에 push 하고 바로 return
   */
  async saveAISData(data: any) {
    if (!data) return;

    // source 태그 기본값
    if (!data.__source) {
      data.__source = this.siteName;
    }
    const source: string = String(data.__source);

    // ---- edge 모드: 로컬 DB/Gateway 로 가지 않고 중앙으로 forward ----
    if (!this.cap.dbEnabled && this.cap.pushToCentralEnabled) {
      // 중앙에 보낼 때는 내부 마킹 제거
      const { __source, ...rest } = data;
      this.centralClient.pushAis({ ...rest, source });
      return;
    }

    // MMSI를 문자열로 통일 (타입 불일치로 인한 중복 방지)
    const mmsi = String(data.mmsi);
    const history = this.pointHistory.get(mmsi);
    if (data.lat && data.lon) {
      // 중복 수신 필터: 동일 MMSI가 DEDUP_WINDOW_MS(3초) 이내 재수신이면 skip
      //   - 단, 새로운 소스에서 오는 경우는 'source merge' 목적으로 허용
      //     (기존 dedup 은 저장/브로드캐스트 중복 방지용이었으므로 유지)
      const now = Date.now();
      const lastReceived = this.mmsiLastReceived.get(mmsi);
      const dedupActive = lastReceived && now - lastReceived < this.DEDUP_WINDOW_MS;

      // source 활성 집합 업데이트는 dedup skip 여부와 무관하게 기록
      this.markActiveSource(mmsi, source, now);

      if (dedupActive) return;
      this.mmsiLastReceived.set(mmsi, now);

      // 동일 MMSI가 이미 처리 중이면 즉시 반환 (await 지점 이벤트 루프 양보 대비)
      if (this.processingMMSI.has(mmsi)) return;
      this.processingMMSI.add(mmsi);

      // 동적 데이터 처리
      const currentTime = Date.now();
      let distance: number;
      let staticInfo: any;
      try {
        distance = await this.calculateDistanceFromCenter(data.lat, data.lon);
        staticInfo = await this.getStaticInfo(mmsi);
      } catch (err) {
        this.processingMMSI.delete(mmsi);
        throw err;
      }

      // 반경 10km 이내의 데이터만 처리 (미터 단위)
      // if (distance > 30000)
      //   return;

      // distance를 소수점 2자리로 제한
      const roundedDistance = Math.round(distance * 100) / 100;
      const name = staticInfo.name || 'No name'

      const newPoint = {
        lat: data.lat,
        lon: data.lon,
        mmsi: mmsi, // 문자열로 통일
        distance: roundedDistance,
        cog: data.courseOverGround || null,
        sog: data.speedOverGround,
        hdg: data.heading || null,
        nav_status: data.nav_status || null,
        rot: data.rot || null,
        heading: data.heading, // 클라이언트 전송용으로 유지
        timestamp: currentTime,
        name: name,
        // ---- 분산 수신 메타 ----
        source,                                             // 이번 프레임을 보낸 엣지 이름
        activeSources: this.getActiveSourcesJson(mmsi, now) // 5분 내 수신 소스 JSON
      };

      const newHistory = history ? [newPoint, ...history.slice(1, 20)] : [newPoint, newPoint];
      this.pointHistory.set(mmsi, newHistory);
      this.processingMMSI.delete(mmsi); // 락 해제
      // 5초 간격으로 전송 (데이터 손실 방지)
      this.sendAisData(false); // force = false (throttle 적용)

      // 정적 데이터가 함께 오는 경우 업데이트
      const hasStaticData = data.name || data.imo || data.call_sign || data.type;
      if (data.name) {
        staticInfo.name = data.name;
      }
      if (data.imo) staticInfo.imo = data.imo;
      if (data.call_sign) staticInfo.call_sign = data.call_sign;
      if (data.type) staticInfo.type = data.type;

      // 업데이트된 정적 정보가 있으면 캐시에 저장
      if (hasStaticData) {
        await this.cacheManager.set(`ais:static:${mmsi}`, staticInfo, 10 * 60000);
      }

    }
    else if (data.name && data.mmsi) {
      // 정적 데이터는 DB와 캐시에 저장
      this.saveStaticInfo(data);
    }
  }

  // ==================== 정적 정보 관리 ====================
  /**
   * 정적 정보 가져오기 (캐시 우선, 없으면 DB에서)
   */
  private async getStaticInfo(mmsi: string): Promise<any> {
    // 캐시에서 정적 정보 전체 가져오기
    const cachedStatic = await this.cacheManager.get(`ais:static:${mmsi}`);
    if (cachedStatic) {
      return cachedStatic;
    }

    // 캐시에 없으면 DB에서 정적 정보 가져오기
    try {
      const staticInfo = await this.aisStaticRepository.findOne({
        where: { mmsi }
      });

      if (staticInfo) {
        const staticData = {
          name: staticInfo.name || '',
          imo: staticInfo.imo || null,
          call_sign: staticInfo.call_sign || '',
          type: staticInfo.type || 0,
          ref_pos_a: staticInfo.ref_pos_a || 0,
          ref_pos_b: staticInfo.ref_pos_b || 0,
          ref_pos_c: staticInfo.ref_pos_c || 0,
          ref_pos_d: staticInfo.ref_pos_d || 0,
          epfd: staticInfo.epfd || 0,
          eta_month: staticInfo.eta_month || null,
          eta_day: staticInfo.eta_day || null,
          eta_hour: staticInfo.eta_hour || null,
          eta_minute: staticInfo.eta_minute || null,
          draft: staticInfo.draft || 0,
          destination: staticInfo.destination || ''
        };

        // 캐시에 저장 (10분)
        await this.cacheManager.set(`ais:static:${mmsi}`, staticData, 10 * 60000);
        return staticData;
      }
    } catch (error: any) {
      this.logger.warn(`[getStaticInfo] MMSI ${mmsi} 정적 정보 조회 실패:`, { message: error?.message });
    }

    // 기본값 반환
    return {
      name: '',
      imo: null,
      call_sign: '',
      type: 0,
      ref_pos_a: 0,
      ref_pos_b: 0,
      ref_pos_c: 0,
      ref_pos_d: 0,
      epfd: 0,
      eta_month: null,
      eta_day: null,
      eta_hour: null,
      eta_minute: null,
      draft: 0,
      destination: ''
    };
  }

  /**
   * 정적 정보 저장 (DB 및 캐시)
   */
  private async saveStaticInfo(data: any): Promise<void> {
    if (!data.mmsi) return;

    try {
      // MMSI를 문자열로 통일
      const mmsi = String(data.mmsi);
      const staticData = {
        mmsi: mmsi,
        imo: data.imo || null,
        call_sign: data.call_sign || '',
        name: data.name || '',
        type: data.type || 0,
        ref_pos_a: data.ref_pos_a || 0,
        ref_pos_b: data.ref_pos_b || 0,
        ref_pos_c: data.ref_pos_c || 0,
        ref_pos_d: data.ref_pos_d || 0,
        epfd: data.epfd || 0,
        eta_month: data.eta_month || null,
        eta_day: data.eta_day || null,
        eta_hour: data.eta_hour || null,
        eta_minute: data.eta_minute || null,
        draft: data.draft || 0,
        destination: data.destination || ''
      };

      // DB에 저장
      await this.aisStaticRepository.upsert(staticData, ['mmsi']);

      // 캐시에도 저장 (10분)
      await this.cacheManager.set(`ais:static:${mmsi}`, staticData, 10 * 60000);
    } catch (error) {
      this.logger.error('정적 정보 저장 실패:', { message: error.message });
    }
  }

  /**
   * AIS 안테나 위치와 AIS 선박 간의 거리 계산 (Haversine 공식)
   * @param lat AIS 선박의 위도
   * @param lon AIS 선박의 경도
   * @returns 거리(미터)
   */
  async calculateDistanceFromCenter(lat: number, lon: number): Promise<number> {
    const R = 6371000; // 지구 반경(미터)
    const gpsInfo = await this.settingService.getAISGPS();
    const dLat = ((lat - gpsInfo.lat) * Math.PI) / 180;
    const dLon = ((lon - gpsInfo.lon) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((gpsInfo.lat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // 거리(미터)
  }

  calculateDistanceBetweenPoints(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // 지구 반경(미터)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); // Haversine 공식
    return R * c; // 거리(미터)
  }

  /**
   * AIS 포인트 삭제 (10분 이내의 데이터만 남김)
   */
  async deleteAISPoint() {
    try {
      // DB에서 10분 이상 업데이트가 없는 AIS 데이터 deleteSent = 1 처리
      const tenMinuteAgo = new Date(Date.now() - 10 * 60000);
      await this.aisRepository
        .createQueryBuilder()
        .update()
        .set({ deleteSent: 1 })
        .where('updatedAt < :tenMinuteAgo', { tenMinuteAgo })
        .andWhere('(deleteSent = 0 OR deleteSent IS NULL)')
        .execute();
    } catch (error: any) {
      this.logger.error('AIS 포인트 삭제 처리 실패:', { message: error.message });
    }
  }

  // ==================== 히스토리 관리 ====================
  /**
   * AIS 포인트 히스토리 추가
   */
  addAISHistory() {
    this.pointHistory.forEach((history, mmsi) => {
      const point = history[0];
      if (!point) return;

      // AISHistory 엔티티에 없는 필드(activeSources, timestamp, heading, name, distance) 는 제외
      const {
        activeSources: _activeSources,
        timestamp: _timestamp,
        heading: _heading,
        name: _name,
        distance: _distance,
        ...historyRow
      } = point;

      this.aisHisotry.push({
        ...historyRow,
        source: point.source ?? this.siteName,
        dynamicSent: 0
      });

      if (history.length >= 2 && this.calculateDistanceBetweenPoints(history[0].lat, history[0].lon, history[1].lat, history[1].lon) > 5) {
        const newHistory = [point, ...history.slice(0, 20)];
        this.pointHistory.set(mmsi, newHistory);
      }
    });
  }

  /**
   * AIS 포인트 기록 삭제 (10분 이내의 데이터만 남김, 히스토리 정리만)
   */
  deleteAISHistory() {
    const tenMinuteAgo = Date.now() - 10 * 60000;
    const keysToDelete: string[] = [];

    // pointHistory에서 10분 이상 된 포인트 제거 (히스토리 정리)
    this.pointHistory.forEach((history, id) => {
      const updatedHistory = history.filter(
        (point) => {
          return point.timestamp > tenMinuteAgo
        }
      );
      if (updatedHistory.length > 0) {
        this.pointHistory.set(id, updatedHistory);
      } else {
        keysToDelete.push(id);
      }
    });

    keysToDelete.forEach(key => {
      this.pointHistory.delete(key);
    });

    // mmsiLastReceived도 오래된 항목 정리
    this.mmsiLastReceived.forEach((time, mmsi) => {
      if (time < tenMinuteAgo) this.mmsiLastReceived.delete(mmsi);
    });
  }

  /**
   * AIS 히스토리 DB 저장
   */
  async upsertAISHistory() {
    if (this.aisHisotry.length == 0) return;
    const queryRunner = this.aisHistoryRepository.manager.connection.createQueryRunner();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.insert(AISHistory, this.aisHisotry.map(({ id, ...rest }) => rest));
      this.aisHisotry = [];
      await queryRunner.commitTransaction()
    } catch (error) {
      this.logger.error('트랜잭션 오류:', { error })
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== 클라이언트 전송 ====================
  /**
   * 클라이언트에 AIS 데이터 전송
   */
  /**
   * 예측 거리 계산 (속도 × 시간차이)
   * AIS 정보가 업데이트될 때마다 시간차이를 계산하여 점점 길어지는 거리 반환
   */
  private calculatePredictedDistance(currentPoint: any): number {
    // 속도와 방향 확인
    const sog = currentPoint.sog || 0; // knots
    const cog = currentPoint.cog; // Course Over Ground
    const heading = currentPoint.heading; // Heading (511 = not available)

    // 속도가 없거나 방향이 없으면 예측 불가
    if (sog <= 0 || (!cog && (!heading || heading === 511))) {
      return 0;
    }

    // 마지막 업데이트 시간과 현재 시간의 차이 계산 (초 단위)
    const currentTime = Date.now();
    const lastUpdateTime = currentPoint.timestamp || currentTime;
    const timeDiffSeconds = (currentTime - lastUpdateTime) / 1000;

    // knots를 m/s로 변환
    const speed_mps = (sog * 1852) / 3600; // knots to m/s

    // 예측 거리 = 속도 × 시간 (미터)
    const predictedDistance = speed_mps * timeDiffSeconds;

    return predictedDistance;
  }

  /**
   * AIS 데이터 전송 (5초 간격으로 제한, 데이터 손실 방지)
   * @param force 즉시 전송 여부 (서버 시작, Cron 등에서 사용)
   */
  sendAisData(force: boolean = false, ignoreDeviceCheck: boolean = false): void {
    const now = Date.now();

    // 즉시 전송이 요청된 경우 (서버 시작, Cron 등)
    if (force) {
      // 기존 타이머가 있으면 취소
      if (this.aisDataSendTimer) {
        clearTimeout(this.aisDataSendTimer);
        this.aisDataSendTimer = null;
      }
      // 즉시 전송
      this.executeSendAisData(ignoreDeviceCheck);
      this.lastAisDataSendTime = now;
      return;
    }

    // 5초가 지났으면 즉시 전송
    if (now - this.lastAisDataSendTime >= this.AIS_SEND_INTERVAL) {
      // 기존 타이머가 있으면 취소
      if (this.aisDataSendTimer) {
        clearTimeout(this.aisDataSendTimer);
        this.aisDataSendTimer = null;
      }
      this.executeSendAisData();
      this.lastAisDataSendTime = now;
      return;
    }

    // 5초가 지나지 않았고 타이머가 없으면 타이머 시작
    // (다음 전송에서 최신 데이터가 전송됨)
    if (!this.aisDataSendTimer) {
      const remainingTime = this.AIS_SEND_INTERVAL - (now - this.lastAisDataSendTime);
      this.aisDataSendTimer = setTimeout(() => {
        this.executeSendAisData();
        this.lastAisDataSendTime = Date.now();
        this.aisDataSendTimer = null;
      }, remainingTime);
    }
    // 타이머가 이미 실행 중이면 아무것도 안 함
    // 다음 전송에서 최신 pointHistory가 사용됨
  }

  /**
   * 실제 AIS 데이터 전송 실행
   */
  private executeSendAisData(ignoreDeviceCheck: boolean = false): void {
    if (!ignoreDeviceCheck && !this.isDeviceConnected) return;
    const currentTime = Date.now();
    const pointHistoryArray = Array.from(this.pointHistory).map(([key, value]) => {
      const currentPoint = value[0]; // 최신 위치

      // 예측 거리 계산 (속도와 방향이 있는 경우만)
      let predictedDistance = 0;
      if (currentPoint && currentPoint.sog > 0.5 && (currentPoint.cog !== undefined || (currentPoint.heading !== undefined && currentPoint.heading !== 511))) {
        predictedDistance = this.calculatePredictedDistance(currentPoint);
      }

      return {
        key: String(key), // 🔥 문자열로 통일하여 전송
        value,
        predictedDistance, // 예측 거리 (미터) 추가
      };
    });

    // 디버깅: pointHistory 상태 로깅
    this.aisGateway.sendAisDataToClients(pointHistoryArray);

    // 가드존 침입 감지 및 알림 (비동기로 실행, 결과를 기다리지 않음)
    // 가드존 침입 감지는 클라이언트에서 처리
  }

  // ==================== Cron 작업 ====================
  /**
   * 1분마다 AIS 데이터 정리 및 저장
   */
  @Cron('0 * * * * *')
  async cleanupAISData() {
    // edge 모드: DB 가 없으므로 skip (중앙이 같은 일을 대신 수행)
    if (!this.cap.dbEnabled) return;
    try {
      this.deleteAISHistory();
      await this.deleteAISPoint();
      this.addAISHistory();
      await this.upsertAISHistory();
      await this.batchUpdateAisData();
      // Cron에서는 즉시 전송 (1분마다이므로 throttle 불필요)
      this.sendAisData(true); // force = true

    } catch (error: any) {
      this.logger.error('[cleanupAISData] 크론 실행 중 오류 발생 (다음 주기에 재시도):', { message: error?.message });
    }
  }

  // ==================== 24/7 SQLite 유지보수 ====================
  /**
   * 매 시 정각: WAL checkpoint (PASSIVE)
   * - WAL 파일이 끝없이 커지지 않게 정기적으로 main DB 에 flush
   */
  @Cron('0 0 * * * *')
  async walCheckpointHourly() {
    if (!this.cap.dbEnabled) return;
    try {
      const r = await this.aisRepository.manager.query(`PRAGMA wal_checkpoint(PASSIVE)`);
      this.logger.structured('info', 'AisService', 'wal_checkpoint', {
        mode: 'PASSIVE',
        result: r?.[0] ?? r,
      });
    } catch (err: any) {
      this.logger.structured('warn', 'AisService', 'wal_checkpoint_fail', {
        error: err?.message,
      });
    }
  }

  /**
   * AISHistory retention (기본 14일, env HISTORY_RETENTION_DAYS 로 조정)
   * 매일 02:30 실행
   */
  @Cron('0 30 2 * * *')
  async pruneAISHistory() {
    if (!this.cap.dbEnabled) return;
    const days = parseInt(
      this.configService.get<string>(envVariableKeys.historyRetentionDays) ?? '14',
      10,
    ) || 14;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const res = await this.aisHistoryRepository
        .createQueryBuilder()
        .delete()
        .where('createdAt < :cutoff', { cutoff })
        .execute();
      this.logger.structured('info', 'AisService', 'history_pruned', {
        days,
        deleted: res.affected,
        cutoff: cutoff.toISOString(),
      });
      // WAL TRUNCATE — 삭제 직후 파일 줄이기
      await this.aisRepository.manager.query(`PRAGMA wal_checkpoint(TRUNCATE)`);
    } catch (err: any) {
      this.logger.structured('warn', 'AisService', 'history_prune_fail', {
        error: err?.message,
      });
    }
  }

  /**
   * 주 1회 (일요일 03:00): ANALYZE + integrity_check + DB 사이즈 체크
   */
  @Cron('0 0 3 * * 0')
  async weeklyDbMaintenance() {
    if (!this.cap.dbEnabled) return;
    try {
      await this.aisRepository.manager.query(`ANALYZE`);
      this.logger.structured('info', 'AisService', 'db_analyze_done', {});
    } catch (err: any) {
      this.logger.structured('warn', 'AisService', 'db_analyze_fail', {
        error: err?.message,
      });
    }

    try {
      const rows = await this.aisRepository.manager.query(`PRAGMA integrity_check`);
      const ok = Array.isArray(rows) && rows[0]?.integrity_check === 'ok';
      this.logger.structured(ok ? 'info' : 'error', 'AisService', 'db_integrity_check', {
        ok,
        detail: rows,
      });
    } catch (err: any) {
      this.logger.structured('warn', 'AisService', 'db_integrity_fail', {
        error: err?.message,
      });
    }

    // DB 파일 사이즈 경고
    try {
      const warnMB = parseInt(this.configService.get<string>(envVariableKeys.dbSizeWarnMB) ?? '500', 10) || 500;
      const sizeRow = await this.aisRepository.manager.query(
        `SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()`,
      );
      const bytes = Number(sizeRow?.[0]?.bytes ?? 0);
      const mb = Math.round(bytes / (1024 * 1024));
      if (mb >= warnMB) {
        this.logger.structured('warn', 'AisService', 'db_size_warning', {
          sizeMB: mb,
          warnMB,
          suggest: 'consider VACUUM or increase HISTORY_RETENTION_DAYS downward',
        });
      } else {
        this.logger.structured('info', 'AisService', 'db_size_ok', {
          sizeMB: mb,
          warnMB,
        });
      }
    } catch (err: any) {
      this.logger.structured('warn', 'AisService', 'db_size_check_fail', {
        error: err?.message,
      });
    }
  }

  /**
   * 하루마다 6개월 지난 데이터 삭제
   */
  @Cron('0 0 0 * * *') // 매일 자정 실행
  async deleteOldAISData() {
    if (!this.cap.dbEnabled) return;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      // AIS 테이블에서 deleteSent=1이고 7일 지난 레코드 정리
      const deletedSent = await this.aisRepository
        .createQueryBuilder()
        .delete()
        .where('deleteSent = 1')
        .andWhere('updatedAt < :sevenDaysAgo', { sevenDaysAgo })
        .execute();

      // AIS 테이블에서 6개월 지난 데이터 삭제
      const deletedAIS = await this.aisRepository
        .createQueryBuilder()
        .delete()
        .where('createdAt < :date', { date: sixMonthsAgo })
        .execute();

      // AISHistory 테이블에서 6개월 지난 데이터 삭제
      const deletedHistory = await this.aisHistoryRepository
        .createQueryBuilder()
        .delete()
        .where('createdAt < :date', { date: sixMonthsAgo })
        .execute();

      // AISStatic 테이블에서 6개월 지난 데이터 삭제
      const deletedStatic = await this.aisStaticRepository
        .createQueryBuilder()
        .delete()
        .where('createdAt < :date', { date: sixMonthsAgo })
        .execute();

      // AISDetection 테이블에서 6개월 지난 데이터 삭제
      const deletedDetection = await this.aisDetectionRepository
        .createQueryBuilder()
        .delete()
        .where('createdAt < :date', { date: sixMonthsAgo })
        .execute();

      this.logger.log(`[AIS DB 정리] deleteSent=1 정리: ${deletedSent.affected}개, 6개월 지난 데이터 삭제 완료 - AIS: ${deletedAIS.affected}, AISHistory: ${deletedHistory.affected}, AISStatic: ${deletedStatic.affected}, AISDetection: ${deletedDetection.affected}`);
    } catch (error) {
      this.logger.error('[AIS DB 정리] 오래된 데이터 삭제 실패:', { error });
    }
  }

  // ==================== API 응답 메서드 ====================
  /**
   * 현재 AIS 데이터 조회
   */
  /**
   * 모든 AIS 데이터 조회
   */
  async findAll() {
    const ais = await this.aisRepository.find({
      select: ['mmsi', 'name']
    })
    return ais;
  }

  /**
   * 날짜 범위로 AIS 히스토리 조회 (커서 페이지네이션)
   */
  async findAISHistoryByDateRange(
    mmsi: string,
    startDate: Date,
    endDate: Date,
    cursorId?: number,
    take: number = 100,
  ): Promise<{ items: AISHistory[]; nextCursorId: number | null; hasNext: boolean }> {
    const qb = this.aisHistoryRepository
      .createQueryBuilder('h')
      .where('h.mmsi = :mmsi', { mmsi })
      .andWhere('h.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .orderBy('h.id', 'DESC')
      .take(take + 1);

    if (cursorId) {
      qb.andWhere('h.id < :cursorId', { cursorId });
    }

    const items = await qb.getMany();
    const hasNext = items.length > take;
    if (hasNext) items.pop();

    return {
      items,
      nextCursorId: hasNext ? items[items.length - 1].id : null,
      hasNext,
    };
  }

  /**
   * 날짜 범위로 AIS 리스트 조회 (해당 기간에 데이터가 있는 선박 목록)
   */
  async findAISListByDateRange(startDate: Date, endDate: Date): Promise<Array<{ mmsi: string; name: string }>> {
    // AISHistory에서 날짜 범위에 해당하는 고유한 MMSI 목록 조회
    const histories = await this.aisHistoryRepository
      .createQueryBuilder('history')
      .select('DISTINCT history.mmsi', 'mmsi')
      .where('history.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getRawMany();

    if (histories.length === 0) {
      return [];
    }

    // MMSI 목록 추출
    const mmsiList = histories.map(h => h.mmsi);

    // AISStatic에서 이름 정보 가져오기
    const staticInfos = await this.aisStaticRepository.find({
      where: {
        mmsi: In(mmsiList),
      },
      select: ['mmsi', 'name'],
    });

    // MMSI를 키로 하는 맵 생성
    const staticMap = new Map(staticInfos.map(s => [s.mmsi, s.name || 'No name']));

    // 결과 반환 (이름이 있으면 사용, 없으면 'No name')
    return mmsiList.map(mmsi => ({
      mmsi,
      name: staticMap.get(mmsi) || 'No name',
    }));
  }

  // ==================== DB 저장 메서드 ====================
  /**
   * AIS 데이터 일괄 저장
   */
  async batchUpdateAisData(): Promise<void> {
    const tenMinutesAgo = Date.now() - 10 * 60000;
    const now = Date.now();

    const pointsToSave = Array.from(this.pointHistory.entries())
      .map(([mmsi, history]) => {
        const latestPoint = history[0];
        if (!latestPoint) return null;
        if (latestPoint.timestamp < tenMinutesAgo) return null;

        // AIS 엔티티에 없는 필드(timestamp, heading, activeSources[문자열이어야 함]) 는 제외/변환
        const {
          timestamp: _timestamp,
          heading: _heading,
          source,
          activeSources: _activeSourcesRaw,
          ...rest
        } = latestPoint;

        return {
          ...rest,
          deleteSent: 0,
          // ---- 분산 수신 메타 ----
          lastSource: source ?? this.siteName,
          activeSources: this.getActiveSourcesJson(String(mmsi), now),
          lastReceivedAt: latestPoint.timestamp ?? now,
        };
      })
      .filter(Boolean);

    if (pointsToSave.length > 0) {
      const queryRunner = this.aisRepository.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        await queryRunner.manager.upsert(AIS, pointsToSave, ['mmsi']);
        await queryRunner.commitTransaction();
      } catch (error) {
        this.logger.error('트랜잭션 오류:', { error });
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    }
  }

  /**
   * 통신 설정 변경에 따른 재연결 (SettingService에서 호출)
   */
  /**
   * 통신 설정 변경에 따른 재연결 (SettingService에서 호출)
   */
  async reloadCommunicationConfig() {
    this.cancelAllReconnectTimers();

    // 모든 시리얼 포트 정리
    for (const [path, state] of this.portStates.entries()) {
      this.intentionallyClosedPaths.add(path);
      state.serialPort.removeAllListeners();
      state.serialPort.on('error', () => {});
      if (state.serialPort.isOpen) state.serialPort.close();
      state.decoder.removeAllListeners();
    }
    this.portStates.clear();

    // TCP 정리
    if (this.tcpClient) {
      this.tcpClient.removeAllListeners();
      this.tcpClient.on('error', (err) => {
        this.logger.error('TCP 연결 오류', { message: err.message });
      });
      this.tcpClient.destroy();
      this.tcpClient = null;
    }
    if (this.tcpDecoder) {
      this.tcpDecoder.removeAllListeners();
      this.tcpDecoder = null;
    }

    await this.loadCommunicationConfig();
  }

  /**
   * AIS 통신 상태 확인
   */
  getCommunicationStatus(): { connected: boolean; type: number } {
    let connected = false;

    if (this.communicationType === 0) {
      // 시리얼: 연결된 포트가 하나라도 있으면 connected
      try {
        connected = [...this.portStates.values()].some(ps => ps.serialPort.isOpen);
      } catch (error) {
        this.logger.error('시리얼 포트 상태 확인 오류:', { error });
      }
    } else if (this.communicationType === 1) {
      // TCP 통신 - 소켓이 존재하고 파괴되지 않았으며 읽기/쓰기 가능한지 확인
      if (this.tcpClient) {
        try {
          connected = !this.tcpClient.destroyed &&
            this.tcpClient.readable &&
            this.tcpClient.writable;
        } catch (error) {
          this.logger.error('TCP 소켓 상태 확인 오류:', { error });
          connected = false;
        }
      } else {
        connected = false;
      }
    }

    return {
      connected,
      type: this.communicationType
    };
  }

  /**
   * 가드존 침입 감지 및 알림 처리
   */
  // 가드존 침입 감지는 클라이언트에서 처리하므로 서버 로직 제거

  // ==================== 분산 수신 source 집계 ====================
  /**
   * 이 MMSI 가 지금 source 엣지로부터 수신됐음을 기록.
   * - ACTIVE_SOURCE_TTL_MS(5분) 이 지난 항목은 제거
   */
  private markActiveSource(mmsi: string, source: string, now: number) {
    if (!source) return;
    let map = this.activeSourcesByMmsi.get(mmsi);
    if (!map) {
      map = new Map();
      this.activeSourcesByMmsi.set(mmsi, map);
    }
    map.set(source, now);

    // TTL 청소
    const cutoff = now - this.ACTIVE_SOURCE_TTL_MS;
    for (const [s, t] of map.entries()) {
      if (t < cutoff) map.delete(s);
    }
    if (map.size === 0) this.activeSourcesByMmsi.delete(mmsi);
  }

  /**
   * 특정 MMSI 의 "최근 5분 내 수신 소스" JSON 문자열 반환.
   * - DB(AIS.activeSources) 저장 및 클라이언트 전송용
   */
  private getActiveSourcesJson(mmsi: string, now: number): string {
    const map = this.activeSourcesByMmsi.get(mmsi);
    if (!map || map.size === 0) {
      return JSON.stringify([this.siteName]);
    }
    const cutoff = now - this.ACTIVE_SOURCE_TTL_MS;
    const alive: string[] = [];
    for (const [s, t] of map.entries()) {
      if (t >= cutoff) alive.push(s);
    }
    return JSON.stringify(alive);
  }

  /**
   * /ais/health 용 종합 스냅샷.
   * - 모드 / 사이트 / 시리얼포트 상태 / TCP 상태 / 중앙 client / 활성 mmsi 수
   */
  getHealthSnapshot() {
    const now = Date.now();
    const serialPorts = [...this.portStates.entries()].map(([path, state]) => ({
      path,
      open: state.serialPort.isOpen,
      lastDataAgoMs: this.portLastDataAt.has(path) ? now - this.portLastDataAt.get(path)! : null,
      reconnectAttempt: this.reconnectAttempts.get(path) ?? 0,
      missCount: this.portMissCount.get(path) ?? 0,
    }));
    const tcp = this.communicationType === 1 ? {
      connected: !!this.tcpClient && !this.tcpClient.destroyed,
      lastDataAgoMs: this.portLastDataAt.has('tcp') ? now - this.portLastDataAt.get('tcp')! : null,
      reconnectAttempt: this.reconnectAttempts.get('tcp') ?? 0,
    } : null;
    return {
      mode: this.siteMode,
      site: this.siteName,
      capabilities: this.cap,
      communicationType: this.communicationType === 0 ? 'serial' : 'tcp',
      deviceConnected: this.isDeviceConnected,
      serialPorts,
      tcp,
      centralClient: this.centralClient.snapshot(),
      trackedMmsiCount: this.pointHistory.size,
      activeSources: this.getActiveSourceSummary().length,
      droughtMs: this.droughtMs,
      ts: now,
    };
  }

  /**
   * 현재 활성 소스 맵 (health 엔드포인트용 요약)
   */
  getActiveSourceSummary(): { mmsi: string; sources: string[] }[] {
    const now = Date.now();
    const cutoff = now - this.ACTIVE_SOURCE_TTL_MS;
    const out: { mmsi: string; sources: string[] }[] = [];
    for (const [mmsi, map] of this.activeSourcesByMmsi.entries()) {
      const alive: string[] = [];
      for (const [s, t] of map.entries()) {
        if (t >= cutoff) alive.push(s);
      }
      if (alive.length) out.push({ mmsi, sources: alive });
    }
    return out;
  }

  // ==================== 모듈 종료 처리 ====================
  async onModuleDestroy() {
    if (this.aisDataSendTimer) {
      clearTimeout(this.aisDataSendTimer);
      this.aisDataSendTimer = null;
    }
    if (this.droughtTimer) {
      clearInterval(this.droughtTimer);
      this.droughtTimer = null;
    }
    this.cancelAllReconnectTimers();

    // 모든 시리얼 포트 종료
    for (const [path, state] of this.portStates.entries()) {
      this.intentionallyClosedPaths.add(path);
      state.serialPort.removeAllListeners();
      state.serialPort.on('error', () => {});
      if (state.serialPort.isOpen) state.serialPort.close();
      state.decoder.removeAllListeners();
    }
    this.portStates.clear();

    // TCP 종료
    if (this.tcpClient) {
      this.tcpClient.destroy();
      this.tcpClient = null;
    }
    if (this.tcpDecoder) {
      this.tcpDecoder.removeAllListeners();
      this.tcpDecoder = null;
    }
  }
}
