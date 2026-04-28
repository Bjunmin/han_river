// -------------------------------------------------------------------------
// SITE_MODE 값과 각 모드의 기능 플래그
//
// 한 번만 env 를 읽고 derived boolean 플래그들로 변환해서
// 코드 전역에서 이 boolean 만 참조한다. (if (mode === 'edge') 산재 방지)
// -------------------------------------------------------------------------

export type SiteMode = 'standalone' | 'combined' | 'central' | 'edge';

export interface SiteCapabilities {
    /** 이 프로세스가 로컬 시리얼 포트를 직접 열고 NMEA 를 수신하는가 */
    serialEnabled: boolean;
    /** 이 프로세스가 /ingest WS 엔드포인트로 다른 엣지의 데이터를 받는가 */
    ingestEnabled: boolean;
    /** 이 프로세스가 SQLite 로 AIS 데이터를 영속화하는가 */
    dbEnabled: boolean;
    /** 이 프로세스가 /ais UI 를 호스팅하고 클라이언트 WS 브로드캐스트를 하는가 */
    uiEnabled: boolean;
    /** 이 프로세스가 WS 클라이언트로서 원격 중앙에 NMEA 를 push 하는가 */
    pushToCentralEnabled: boolean;
}

const capabilitiesByMode: Record<SiteMode, SiteCapabilities> = {
    standalone: {
        serialEnabled: true,
        ingestEnabled: false,
        dbEnabled: true,
        uiEnabled: true,
        pushToCentralEnabled: false,
    },
    combined: {
        serialEnabled: true,
        ingestEnabled: true,
        dbEnabled: true,
        uiEnabled: true,
        pushToCentralEnabled: false,
    },
    central: {
        serialEnabled: false,
        ingestEnabled: true,
        dbEnabled: true,
        uiEnabled: true,
        pushToCentralEnabled: false,
    },
    edge: {
        serialEnabled: true,
        ingestEnabled: false,
        dbEnabled: false,
        uiEnabled: false,
        pushToCentralEnabled: true,
    },
};

export function resolveSiteMode(raw: string | undefined | null): SiteMode {
    const v = (raw ?? 'standalone').trim().toLowerCase();
    if (v === 'standalone' || v === 'combined' || v === 'central' || v === 'edge') {
        return v;
    }
    // 알 수 없는 값이면 가장 안전한 standalone 으로
    return 'standalone';
}

export function getCapabilities(mode: SiteMode): SiteCapabilities {
    return capabilitiesByMode[mode];
}

/** 현재 모드에서 실제로 사용하는 모든 flag 를 한 객체로 */
export function describeMode(mode: SiteMode, siteName: string, centralWsUrl: string | undefined) {
    const cap = getCapabilities(mode);
    return {
        mode,
        siteName,
        centralWsUrl: cap.pushToCentralEnabled ? centralWsUrl ?? null : null,
        ...cap,
    };
}
