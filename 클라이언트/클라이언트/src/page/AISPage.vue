<template>
    <div class="ais-layout">

        <!-- ◆ 최상단 헤더 -->
        <header class="topbar">
            <div class="topbar-left">
                <span class="topbar-logo">AIS WATCH</span>
                <span class="topbar-sub">한강 선박 감시 시스템</span>
            </div>
            <div class="topbar-right">
                <span class="topbar-time mono">{{ currentTime }}</span>
                <span class="live-badge" :class="{ 'live-badge--err': alertAISError }">
                    {{ alertAISError ? 'ERROR' : 'LIVE' }}
                </span>
            </div>
        </header>

        <!-- ◆ 본문 영역 -->
        <div class="body">

            <!-- ── 좌측 아이콘 레일 ── -->
            <nav class="icon-rail">
                <!-- 검색 토글 -->
                <button class="rail-btn" :class="{ 'rail-btn--on': searchActive }" @click="toggleSearch" title="검색">
                    <span class="rail-glyph">⌕</span>
                    <span class="rail-lbl">검색</span>
                </button>

                <!-- 기간 토글 -->
                <button class="rail-btn" :class="{ 'rail-btn--on': periodActive }" @click="togglePeriod" title="기간 필터">
                    <span class="rail-glyph">📅</span>
                    <span class="rail-lbl">기간</span>
                    <span v-if="startDate && endDate && periodActive" class="rail-period-badge">ON</span>
                </button>

                <!-- 경보 토글 -->
                <button class="rail-btn" :class="{ 'rail-btn--on': alertActive, 'rail-btn--warn': alertActive && alertAISError }" @click="alertActive = !alertActive" title="경보">
                    <span class="rail-glyph" :class="{ 'glyph-warn': alertActive && alertAISError }">⚠</span>
                    <span class="rail-lbl">경보</span>
                    <span v-if="alertActive && alertAISError" class="rail-badge"></span>
                </button>

                <!-- 항적 토글 -->
                <button class="rail-btn" :class="{ 'rail-btn--on': trackActive }" @click="trackActive = !trackActive" title="실시간 항적">
                    <span class="rail-glyph">〰</span>
                    <span class="rail-lbl">항적</span>
                </button>

                <!-- 선박 목록 토글 -->
                <button class="rail-btn" :class="{ 'rail-btn--on': drawerOpen }" @click="toggleDrawer" title="선박 목록">
                    <span class="rail-glyph">⛵</span>
                    <span class="rail-lbl">선박</span>
                </button>

                <div style="flex: 1" />

                <!-- 설정 패널 -->
                <button class="rail-btn" :class="{ 'rail-btn--on': settingsPanelOpen }" @click="settingsPanelOpen = !settingsPanelOpen" title="설정">
                    <span class="rail-glyph">⚙</span>
                    <span class="rail-lbl">설정</span>
                </button>
            </nav>

            <!-- ── 좌측 설정 슬라이드 패널 ── -->
            <div class="lpanel" :class="{ 'lpanel--open': settingsPanelOpen }">
                <div class="lpanel-hdr">
                    <span>⚙&ensp;설정</span>
                    <button class="close-btn" @click="settingsPanelOpen = false">✕</button>
                </div>
                <div class="lpanel-body">

                    <div class="lp-section">
                        <div class="lp-section-ttl">건물 위치</div>
                        <div class="lp-row">
                            <span class="lp-key">위도</span>
                            <span class="lp-val mono">{{ buildingGPS?.lat }}</span>
                        </div>
                        <div class="lp-row">
                            <span class="lp-key">경도</span>
                            <span class="lp-val mono">{{ buildingGPS?.lon }}</span>
                        </div>
                        <button class="full-btn" @click="openBuildingGPSDialog">위치 수정</button>
                    </div>

                    <div class="lp-sep" />

                    <div class="lp-section">
                        <div class="lp-section-ttl">AIS 통신</div>
                        <div class="lp-row">
                            <span class="lp-key">상태</span>
                            <span :style="{ color: alertAISError ? 'var(--sr-danger)' : 'var(--sr-accent)', fontSize: '11px' }">
                                {{ alertAISError ? '신호 없음' : '정상' }}
                            </span>
                        </div>
                        <button class="full-btn" @click="openAISCommunicationDialog">통신 설정</button>
                        <button class="full-btn" style="margin-top: 4px" @click="openIPDialog">IP 설정</button>
                    </div>

                </div>
            </div>

            <!-- ── 지도 컨테이너 ── -->
            <v-container id="container" fluid style="position: absolute; inset: 0; padding: 0; z-index: 1;" @click="handleClick">
                <AISCanvas
                    :width="centerX * 2"
                    :height="centerY * 2"
                    :clickedX="clickedX"
                    :clickedY="clickedY"
                    :measure="1 / resolution"
                    :showTrack="trackActive"
                    :isHiding="isZooming"
                    v-on:selectAIS="onMapSelectAIS"
                    :map="map"
                />
                <ElectronicChart
                    :width="centerX * 2"
                    :height="centerY * 2"
                    style="position: absolute; inset: 0; z-index: 10"
                    v-on:changeCenter="changeCenter"
                    v-on:setMap="setMap"
                    v-on:zoomStart="isZooming = true"
                    v-on:zoomEnd="isZooming = false"
                />
            </v-container>

            <!-- ── 경보 오버레이 (alertActive && 에러) ── -->
            <transition name="fade">
                <div v-if="alertActive && alertAISError" class="alert-overlay">
                    <span class="alert-overlay-dot"></span>
                    AIS 신호 없음 — 2분 이상 미수신
                </div>
            </transition>

            <!-- ── 기간 필터 오버레이 (periodActive일 때) ── -->
            <div v-if="periodActive" class="overlay-tl">
                <div class="date-bar">
                    <span class="date-bar-range mono">{{ filterDateLabel }}</span>
                    <button class="xs-btn" @click="showDatePicker = !showDatePicker">변경</button>
                    <button class="xs-btn danger-btn" @click="clearDateFilter" title="기간 초기화">✕</button>
                </div>
                <div v-if="showDatePicker" class="date-picker-panel">
                    <div class="dp-row">
                        <span class="dp-lbl">시작</span>
                        <input type="date" class="dp-input" v-model="startDate" />
                    </div>
                    <div class="dp-row">
                        <span class="dp-lbl">종료</span>
                        <input type="date" class="dp-input" v-model="endDate" />
                    </div>
                    <div class="dp-shortcuts">
                        <button class="chip-btn" @click="setDatePreset('today')">오늘</button>
                        <button class="chip-btn" @click="setDatePreset('24h')">24H</button>
                        <button class="chip-btn" @click="setDatePreset('7d')">7일</button>
                    </div>
                    <button class="full-btn primary-btn" style="margin-top: 6px" @click="applyDateFilter">조회</button>
                </div>
            </div>

            <!-- ── 검색 오버레이 (searchActive일 때) ── -->
            <div class="overlay-tr">
                <div v-if="searchActive" class="search-box">
                    <span class="search-icon">⌕</span>
                    <input class="search-input" v-model="searchQuery" placeholder="선박명/MMSI 검색..." autofocus />
                </div>
                <div class="map-tools">
                    <button class="map-tool" @click="zoomIn" title="줌 인">+</button>
                    <button class="map-tool" @click="zoomOut" title="줌 아웃">−</button>
                    <button class="map-tool" @click="moveToBuilding" title="건물 위치로 이동">◎</button>
                </div>
            </div>

            <!-- ── 하단 플로팅 드로어 ── -->
            <div class="bottom-drawer" :class="{ 'bottom-drawer--open': drawerOpen }">

                <div class="drawer-hdr">
                    <div class="handle-wrap" @click="drawerOpen = !drawerOpen" style="cursor:pointer;">
                        <div class="handle-bar"></div>
                    </div>

                    <div class="drawer-tabs">
                        <button
                            v-for="(tab, i) in drawerTabs"
                            :key="i"
                            class="dtab"
                            :class="{ 'dtab--on': activeDrawerTab === i }"
                            @click="setDrawerTab(i)"
                        >
                            <span v-if="tab.dot" class="dtab-dot"></span>
                            {{ tab.label }}
                        </button>
                    </div>

                    <div class="drawer-hdr-right">
                        <button class="hdr-btn" @click="downloadCSV" title="CSV 다운로드">CSV ↓</button>
                        <button class="hdr-btn" @click="drawerOpen = !drawerOpen">
                            {{ drawerOpen ? '∨ 접기' : '∧ 펼치기' }}
                        </button>
                    </div>
                </div>

                <div v-show="drawerOpen" class="drawer-body">

                    <!-- 탭 0: 리스트 -->
                    <div v-show="activeDrawerTab === 0" class="dpane dpane--split">
                        <div class="list-col">
                            <div class="list-scroll">
                                <table class="ship-tbl">
                                    <thead>
                                        <tr>
                                            <th style="width: 14px;"></th>
                                            <th>선박명</th>
                                            <th>MMSI</th>
                                            <th>위치</th>
                                            <th>최근수신</th>
                                            <th>SOG</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr
                                            v-for="ship in displayedShips"
                                            :key="ship.mmsi"
                                            class="ship-row"
                                            :class="{ 'ship-row--sel': selectedMMSI === ship.mmsi }"
                                            @click="clickShip(ship)"
                                        >
                                            <td><span class="sdot" :class="selectedMMSI === ship.mmsi ? 'sdot--sel' : shipAgeClass(ship)"></span></td>
                                            <td class="td-name">{{ ship.name || '—' }}</td>
                                            <td class="mono td-dim">{{ ship.mmsi }}</td>
                                            <td class="mono td-dim">{{ fmtLatLon(ship.lat, ship.lon) }}</td>
                                            <td class="mono td-dim">{{ fmtTime(ship.timestamp) }}</td>
                                            <td class="mono td-sog">{{ fmtSog(ship.sog) }}</td>
                                        </tr>
                                        <tr v-if="displayedShips.length === 0">
                                            <td colspan="6" class="empty-row">수신된 선박 없음</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="detail-col">
                            <template v-if="selectedAIS">
                                <div class="det-hdr">
                                    <div class="det-title-row">
                                        <span class="det-dot-icon">⊙</span>
                                        <span class="det-name">{{ selectedAIS.name || selectedAIS.mmsi }}</span>
                                        <span class="tag tag--gray">AIS</span>
                                        <span class="tag tag--orange">TRACK</span>
                                    </div>
                                    <div class="det-actions">
                                        <button class="xs-btn" @click="centerOnShip">센터링</button>
                                        <button class="xs-btn" @click="setDrawerTab(1)">항적 ↗</button>
                                    </div>
                                </div>
                                <div class="det-grid">
                                    <div class="det-row"><span class="det-k">MMSI</span><span class="det-v mono">{{ selectedAIS.mmsi }}</span></div>
                                    <div class="det-row"><span class="det-k">LAST RX</span><span class="det-v mono">{{ fmtTime(selectedAIS.timestamp) }}</span></div>
                                    <div class="det-row"><span class="det-k">LAT</span><span class="det-v mono">{{ fmtCoord(selectedAIS.lat, 5) }}° N</span></div>
                                    <div class="det-row"><span class="det-k">LON</span><span class="det-v mono">{{ fmtCoord(selectedAIS.lon, 5) }}° E</span></div>
                                    <div class="det-row"><span class="det-k">SOG</span><span class="det-v mono">{{ fmtSog(selectedAIS.sog) }} kn</span></div>
                                    <div class="det-row"><span class="det-k">COG</span><span class="det-v mono">{{ selectedAIS.cog }}°</span></div>
                                    <div class="det-row"><span class="det-k">HEADING</span><span class="det-v mono">{{ selectedAIS.heading }}°</span></div>
                                    <div class="det-row"><span class="det-k">거리</span><span class="det-v mono">{{ fmtDist(selectedAIS.distance) }}</span></div>
                                </div>
                            </template>
                            <div v-else class="det-empty">선박을 클릭하면<br>상세 정보가 표시됩니다</div>
                        </div>
                    </div>

                    <!-- 탭 1: 항적 요약 -->
                    <div v-show="activeDrawerTab === 1" class="dpane dpane--summary">
                        <template v-if="selectedAIS">
                            <!-- 실시간 모드: in-memory pointHistory 기준 -->
                            <template v-if="!periodActive">
                                <div class="tl-hdr">
                                    <span class="tl-hdr-name">⊙ {{ selectedAIS.name || selectedAIS.mmsi }}</span>
                                    <span class="mono tl-hdr-range">{{ realtimeRangeLabel }}</span>
                                </div>
                                <div v-if="!realtimeTrackSummary" class="tl-empty">항적 데이터 없음</div>
                                <template v-else>
                                    <div class="sum-grid">
                                        <div class="sum-row"><span class="sum-k">총 포인트</span><span class="sum-v mono">{{ realtimeTrackSummary.count }} 개</span></div>
                                        <div class="sum-row"><span class="sum-k">시작 시각</span><span class="sum-v mono">{{ realtimeTrackSummary.startTime }}</span></div>
                                        <div class="sum-row"><span class="sum-k">종료 시각</span><span class="sum-v mono">{{ realtimeTrackSummary.endTime }}</span></div>
                                        <div class="sum-row"><span class="sum-k">이동 시간</span><span class="sum-v mono">{{ realtimeTrackSummary.duration }}</span></div>
                                        <div class="sum-row"><span class="sum-k">시작 위치</span><span class="sum-v mono">{{ realtimeTrackSummary.startPos }}</span></div>
                                        <div class="sum-row"><span class="sum-k">종료 위치</span><span class="sum-v mono">{{ realtimeTrackSummary.endPos }}</span></div>
                                    </div>
                                </template>
                            </template>

                            <!-- 기간/전체 모드: DB 조회 결과 기준 -->
                            <template v-else>
                                <div class="tl-hdr">
                                    <span class="tl-hdr-name">⊙ {{ selectedAIS.name || selectedAIS.mmsi }}</span>
                                    <span class="mono tl-hdr-range">{{ trackRangeLabel }}</span>
                                    <button class="xs-btn" @click="fetchTrackData(selectedMMSI)">재조회</button>
                                </div>
                                <div v-if="!trackSummary" class="tl-empty">조회 중...</div>
                                <template v-else>
                                    <div class="sum-grid">
                                        <div class="sum-row"><span class="sum-k">총 포인트</span><span class="sum-v mono">{{ trackSummary.count }} 개</span></div>
                                        <div class="sum-row"><span class="sum-k">시작 시각</span><span class="sum-v mono">{{ trackSummary.startTime }}</span></div>
                                        <div class="sum-row"><span class="sum-k">종료 시각</span><span class="sum-v mono">{{ trackSummary.endTime }}</span></div>
                                        <div class="sum-row"><span class="sum-k">이동 시간</span><span class="sum-v mono">{{ trackSummary.duration }}</span></div>
                                        <div class="sum-row"><span class="sum-k">시작 위치</span><span class="sum-v mono">{{ trackSummary.startPos }}</span></div>
                                        <div class="sum-row"><span class="sum-k">종료 위치</span><span class="sum-v mono">{{ trackSummary.endPos }}</span></div>
                                    </div>
                                </template>
                            </template>
                        </template>
                        <div v-else class="det-empty" style="height: 100%;">선박을 선택하면 항적 요약이 표시됩니다</div>
                    </div>

                    <!-- 탭 2: 과거 이력 -->
                    <div v-show="activeDrawerTab === 2" class="dpane dpane--history">
                        <template v-if="selectedAIS">
                            <div class="history-hdr">
                                <span class="tl-hdr-name">⊙ {{ selectedAIS.name || selectedAIS.mmsi }}</span>
                                <span class="mono tl-hdr-range">{{ trackRangeLabel }}</span>
                                <button class="xs-btn" @click="fetchTrackData(selectedMMSI)">재조회</button>
                            </div>
                            <div v-if="trackData.length === 0" class="tl-empty">조회 중...</div>
                            <div v-else class="history-scroll">
                                <table class="ship-tbl">
                                    <thead>
                                        <tr><th>#</th><th>시각</th><th>위도</th><th>경도</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(pt, i) in trackData" :key="pt.id || i" class="ship-row">
                                            <td class="mono td-dim">{{ i + 1 }}</td>
                                            <td class="mono td-dim">{{ fmtHistoryTime(pt.createdAt) }}</td>
                                            <td class="mono td-dim">{{ fmtCoord(pt.lat, 4) }}</td>
                                            <td class="mono td-dim">{{ fmtCoord(pt.lon, 4) }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <div v-if="trackHasNext" class="load-more-row">
                                    <button class="xs-btn load-more-btn" @click="loadMoreHistory">
                                        100건 더 불러오기
                                    </button>
                                </div>
                                <div v-else class="load-more-row load-more-end">
                                    총 {{ trackData.length }}건 (전체 조회 완료)
                                </div>
                            </div>
                        </template>
                        <div v-else class="det-empty" style="height: 100%;">선박을 선택하면 과거 이력이 표시됩니다</div>
                    </div>

                </div>
            </div>

        </div><!-- /.body -->

        <!-- ── IP 설정 다이얼로그 ── -->
        <v-dialog v-model="ipDialog" max-width="500">
            <v-card>
                <v-card-title>IP 설정</v-card-title>
                <v-card-text>
                    <v-form>
                        <v-text-field v-model="aisIP" label="AIS IP 주소" placeholder="예: 192.168.0.10" outlined dense />
                        <v-text-field v-model="aisPort" label="AIS Port" type="number" outlined dense />
                        <v-text-field v-model="aisWSPort" label="AIS WS Port" type="number" outlined dense />
                        <v-divider class="my-3" />
                        <p class="text-subtitle-1 font-weight-bold">레이더1 설정</p>
                        <v-text-field v-model="radar1IP" label="Radar1 IP" outlined dense />
                        <v-text-field v-model="radar1Port" label="Radar1 Port" type="number" outlined dense />
                        <v-text-field v-model="radar1WSPort" label="Radar1 WS Port" type="number" outlined dense />
                        <v-divider class="my-3" />
                        <p class="text-subtitle-1 font-weight-bold">레이더2 설정</p>
                        <v-text-field v-model="radar2IP" label="Radar2 IP" outlined dense />
                        <v-text-field v-model="radar2Port" label="Radar2 Port" type="number" outlined dense />
                        <v-text-field v-model="radar2WSPort" label="Radar2 WS Port" type="number" outlined dense />
                        <v-divider class="my-3" />
                        <v-text-field v-model="externalApiIp" label="중앙서버 IP" outlined dense />
                        <v-text-field v-model="externalApiPort" label="중앙서버 Port" type="number" outlined dense />
                    </v-form>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="ipDialog = false">취소</v-btn>
                    <v-btn color="primary" @click="saveIPSetting">저장</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ── AIS 통신 설정 다이얼로그 ── -->
        <v-dialog v-model="aisCommunicationDialog" max-width="500px">
            <v-card>
                <v-card-title>AIS 통신 설정</v-card-title>
                <v-card-text>
                    <v-form>
                        <v-radio-group v-model="communicationType" label="통신 방법">
                            <v-radio label="시리얼 (USB)" :value="0" />
                            <v-radio label="TCP 통신" :value="1" />
                        </v-radio-group>

                        <v-divider class="my-4"></v-divider>

                        <!-- 시리얼 설정 (다중 포트 선택 지원) -->
                        <div v-if="communicationType === 0">
                            <v-select
                                v-model="selectedSerialPorts"
                                :items="serialPorts"
                                label="시리얼 포트 선택 (복수 선택 가능)"
                                placeholder="AIS 수신기 포트를 하나 또는 여러 개 선택하세요"
                                outlined
                                dense
                                multiple
                                chips
                                clearable
                                persistent-hint
                                hint="USB 수신기 여러 개를 동시에 읽으려면 전부 선택하세요"
                            ></v-select>
                            <v-text-field
                                v-model="manualPortInput"
                                label="시리얼 포트 직접 입력 (선택 사항)"
                                placeholder="예: /dev/cu.usbserial-1110"
                                outlined
                                dense
                                clearable
                                hint="목록에 없는 포트를 추가하고 싶을 때 입력 후 Enter"
                                @keyup.enter="addManualPort"
                                append-icon="mdi-plus"
                                @click:append="addManualPort"
                            ></v-text-field>
                        </div>
                        <div v-if="communicationType === 1">
                            <v-text-field v-model="tcpIp" label="TCP IP 주소" outlined dense />
                            <v-text-field v-model="tcpPort" label="TCP Port" type="number" outlined dense />
                        </div>
                    </v-form>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="aisCommunicationDialog = false">취소</v-btn>
                    <v-btn color="primary" @click="saveAISCommunicationConfig">저장</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ── 건물 위치 다이얼로그 ── -->
        <v-dialog v-model="buildingGPSDialog" max-width="400px">
            <v-card>
                <v-card-title>건물 위치 설정</v-card-title>
                <v-card-text>
                    <v-text-field label="위도 (Latitude)" type="number" step="0.0001" v-model.number="buildingGPSForm.lat" outlined dense />
                    <v-text-field label="경도 (Longitude)" type="number" step="0.0001" v-model.number="buildingGPSForm.lon" outlined dense />
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="buildingGPSDialog = false">취소</v-btn>
                    <v-btn color="primary" @click="saveBuildingGPS">저장</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useStore } from 'vuex';

import AISCanvas       from '@/components/AISCanvas.vue';
import ElectronicChart from '@/components/ElectronicChart.vue';

export default {
    name: 'ais-page',
    components: { AISCanvas, ElectronicChart },
    setup() {
        const store = useStore();

        /* ── 지도 / 캔버스 ── */
        const centerX   = ref(0);
        const centerY   = ref(0);
        const offsetX   = ref(0);
        const offsetY   = ref(0);
        const clickedX  = ref(0);
        const clickedY  = ref(0);
        const resolution = ref(232);
        const map        = ref(null);
        const centerPixel = ref([]);
        const isZooming  = ref(false);

        /* ── UI 토글 상태 ── */
        const drawerOpen      = ref(false);
        const activeDrawerTab = ref(0);
        const settingsPanelOpen = ref(false);

        // 사이드바 토글 4개
        const searchActive = ref(false);
        const periodActive = ref(false);
        const alertActive  = ref(true);   // 경보는 기본 ON
        const trackActive  = ref(true);   // 항적은 기본 ON

        const showDatePicker = ref(false);

        /* ── 선박 선택 ── */
        const selectedAIS  = ref(null);
        const selectedMMSI = computed(() => store.getters.getSelectedMMSI);

        /* ── 검색 / 날짜 ── */
        const searchQuery = ref('');
        const startDate   = ref('');
        const endDate     = ref('');

        /* ── 현재 시각 ── */
        const currentTime = ref('');
        let clockInterval = null;
        const updateClock = () => {
            const n = new Date();
            const p = (v) => String(v).padStart(2, '0');
            currentTime.value = `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}  ${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
        };

        /* ── IP 설정 ── */
        const ipDialog      = ref(false);
        const aisIP         = ref('');
        const aisPort       = ref(0);
        const aisWSPort     = ref(0);
        const radar1IP      = ref('localhost');
        const radar1Port    = ref(7300);
        const radar1WSPort  = ref(7100);
        const radar2IP      = ref('localhost');
        const radar2Port    = ref(7301);
        const radar2WSPort  = ref(7101);
        const externalApiIp = ref('118.40.116.129');
        const externalApiPort = ref(24010);

        /* ── AIS 통신 (다중 시리얼 지원) ── */
        const aisCommunicationDialog = ref(false);
        const communicationType   = ref(0); // 0: serial, 1: tcp
        const selectedSerialPorts = ref([]); // 다중 선택된 포트 배열
        const manualPortInput     = ref('');  // 목록 밖 포트 수동 입력 버퍼
        const tcpIp               = ref('127.0.0.1');
        const tcpPort             = ref(4001);
        const serialPorts         = computed(() => store.getters.getSerialPorts);
        const aisCommunicationStatus = computed(() => store.getters.getAISCommunicationStatus);

        const addManualPort = () => {
            const v = (manualPortInput.value || '').trim();
            if (!v) return;
            if (!selectedSerialPorts.value.includes(v)) {
                selectedSerialPorts.value = [...selectedSerialPorts.value, v];
            }
            manualPortInput.value = '';
        };

        /* ── GPS ── */
        const buildingGPS   = computed(() => store.getters.getBuildingGPS);
        const showRadar     = computed(() => store.getters.getShowRadar);
        const alertAISError = computed(() => !store.getters.getIsReceive);

        /* ── 건물 위치 ── */
        const buildingGPSDialog = ref(false);
        const buildingGPSForm   = ref({ lat: 0, lon: 0 });

        /* ── 표시용 선박 목록 ── */
        const displayedShips = computed(() => {
            const q = searchActive.value ? searchQuery.value.toLowerCase() : '';

            if (periodActive.value) {
                // 기간 모드: GET /ais → { mmsi, name } 목록
                const source = store.getters.getAllAISData || [];
                return source.filter(ship => {
                    if (!q) return true;
                    return String(ship.mmsi).includes(q) || String(ship.name || '').toLowerCase().includes(q);
                });
            }

            // 실시간 모드
            const now = Date.now();
            return store.getters.getAISData
                .filter(ais => {
                    const p = ais.value[0];
                    if (p?.timestamp && now - p.timestamp > 4 * 60 * 1000) return false;
                    if (!q) return true;
                    return String(p.mmsi).includes(q) || String(p.name || '').toLowerCase().includes(q);
                })
                .map(ais => ais.value[0]);
        });

        const aisCount = computed(() => displayedShips.value.length);

        /* ── 항적 데이터 ── */
        const trackData    = computed(() => store.getters.getAISDateData || []);
        const trackHasNext = computed(() => store.getters.getAISDateHasNext);

        // 더 불러오기용 args 저장
        const lastFetchArgs = ref(null);

        // 탭1: 화면에 그려진 in-memory 항적(WS pointHistory) 요약
        const realtimeTrackSummary = computed(() => {
            if (!selectedMMSI.value) return null;
            const entry = store.getters.getAISData.find(
                a => String(a.key) === String(selectedMMSI.value)
            );
            if (!entry?.value?.length) return null;
            const pts = entry.value.filter(p => p && p.lat && p.lon);
            if (pts.length < 2) return null;

            const newest = pts[0];
            const oldest = pts[pts.length - 1];
            let duration = '—';
            if (newest.timestamp && oldest.timestamp) {
                const diffMs = Math.abs(newest.timestamp - oldest.timestamp);
                const h = Math.floor(diffMs / 3600000);
                const m = Math.floor((diffMs % 3600000) / 60000);
                const s = Math.floor((diffMs % 60000) / 1000);
                duration = h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${s}초` : `${s}초`;
            }
            return {
                count:     pts.length,
                startTime: fmtTime(oldest.timestamp),
                endTime:   fmtTime(newest.timestamp),
                duration,
                startPos: `${fmtCoord(oldest.lat, 4)}, ${fmtCoord(oldest.lon, 4)}`,
                endPos:   `${fmtCoord(newest.lat, 4)}, ${fmtCoord(newest.lon, 4)}`,
            };
        });

        // 탭1 헤더 범위 레이블 (in-memory 데이터 기준)
        const realtimeRangeLabel = computed(() => {
            if (!realtimeTrackSummary.value) return '화면 항적';
            return `${realtimeTrackSummary.value.startTime} → ${realtimeTrackSummary.value.endTime}`;
        });

        // 탭2: DB 조회 결과 요약 (기간 모드에서만 사용)
        const trackSummary = computed(() => {
            const pts = trackData.value;
            if (pts.length === 0) return null;
            const first = pts[pts.length - 1];
            const last  = pts[0];
            const tsFirst = first.createdAt;
            const tsLast  = last.createdAt;
            let duration = '—';
            if (tsFirst && tsLast) {
                const diffMs = Math.abs(new Date(tsLast) - new Date(tsFirst));
                const h = Math.floor(diffMs / 3600000);
                const m = Math.floor((diffMs % 3600000) / 60000);
                duration = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
            }
            return {
                count:     pts.length,
                startTime: fmtHistoryTime(tsFirst),
                endTime:   fmtHistoryTime(tsLast),
                duration,
                startPos: `${fmtCoord(first.lat, 4)}, ${fmtCoord(first.lon, 4)}`,
                endPos:   `${fmtCoord(last.lat, 4)}, ${fmtCoord(last.lon, 4)}`,
            };
        });

        /* ── 드로어 탭 ── */
        const drawerTabs = computed(() => [
            { label: periodActive.value ? `전체 (${aisCount.value})` : `실시간 (${aisCount.value})`, dot: false },
            { label: '항적 요약', dot: !!selectedAIS.value },
            { label: '과거 이력', dot: false },
        ]);

        const filterDateLabel = computed(() =>
            startDate.value && endDate.value
                ? `${startDate.value} → ${endDate.value}`
                : '날짜 미설정'
        );

        // 항적/이력 탭 헤더에 표시할 조회 범위
        const trackRangeLabel = computed(() =>
            startDate.value && endDate.value
                ? `${startDate.value} → ${endDate.value}`
                : '최근 1시간'
        );

        /* ── 토글 메서드 ── */
        const toggleSearch = () => {
            searchActive.value = !searchActive.value;
            if (!searchActive.value) searchQuery.value = '';
        };

        const togglePeriod = () => {
            periodActive.value = !periodActive.value;
            if (periodActive.value) {
                store.dispatch('getAllAISData');
                store.commit('setAISDateData', []);
            } else {
                clearDateFilter();
            }
        };

        const toggleDrawer = () => { drawerOpen.value = !drawerOpen.value; };

        const setDrawerTab = (i) => {
            activeDrawerTab.value = i;
            if (!drawerOpen.value) drawerOpen.value = true;
        };

        /* ── 날짜 필터 ── */
        const setDatePreset = (range) => {
            const today = new Date();
            const fmt = (d) => {
                const p = (v) => String(v).padStart(2, '0');
                return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
            };
            if (range === 'today') { startDate.value = endDate.value = fmt(today); }
            else if (range === '24h') { startDate.value = fmt(new Date(today - 86400000)); endDate.value = fmt(today); }
            else if (range === '7d') { startDate.value = fmt(new Date(today - 7 * 86400000)); endDate.value = fmt(today); }
        };

        const applyDateFilter = () => {
            showDatePicker.value = false;
            if (!startDate.value || !endDate.value) return;
            if (selectedMMSI.value) fetchTrackData(selectedMMSI.value);
        };

        const clearDateFilter = () => {
            startDate.value = '';
            endDate.value   = '';
            showDatePicker.value = false;
            store.commit('setAISDateData', []);
        };

        const fetchTrackData = (mmsi) => {
            if (!mmsi) return;
            let s, e;
            if (startDate.value && endDate.value) {
                s = new Date(startDate.value); s.setHours(0, 0, 0, 0);
                e = new Date(endDate.value);   e.setHours(23, 59, 59, 999);
            } else {
                // 실시간 모드: 최근 1시간
                e = new Date();
                s = new Date(e.getTime() - 60 * 60 * 1000);
            }
            const args = { mmsi, startDate: s.toISOString(), endDate: e.toISOString(), take: 100 };
            lastFetchArgs.value = args;
            store.dispatch('getAISDataBetweenDate', args);
        };

        const loadMoreHistory = () => {
            if (!lastFetchArgs.value || !trackHasNext.value) return;
            store.dispatch('loadMoreAISHistory', lastFetchArgs.value);
        };

        /* ── 선박 선택 ── */
        const clickShip = (ship) => {
            const mmsi = ship.mmsi;
            if (selectedMMSI.value === mmsi) {
                store.commit('setSelectedMMSI', null);
                store.commit('setAISDateData', []);
                selectedAIS.value = null;
            } else {
                store.commit('setSelectedMMSI', mmsi);
                selectedAIS.value = ship;
                // 기간 모드에서만 DB 조회 (실시간 모드는 in-memory pointHistory 사용)
                if (periodActive.value) fetchTrackData(mmsi);
            }
        };

        const onMapSelectAIS = (ais) => {
            selectedAIS.value = ais;
            if (!drawerOpen.value) drawerOpen.value = true;
            // 기간 모드에서만 DB 조회 (실시간 모드는 in-memory pointHistory 사용)
            if (ais?.mmsi && periodActive.value) fetchTrackData(ais.mmsi);
        };

        /* ── 지도 도구 (카카오 adapter 사용) ── */
        const centerOnShip = () => {
            if (!map.value || !selectedAIS.value) return;
            const lat = Number(selectedAIS.value.lat);
            const lon = Number(selectedAIS.value.lon);
            if (lat && lon) map.value.setCenterLonLat(lon, lat);
        };

        const zoomIn  = () => { if (map.value?.setZoom) { isZooming.value = true; map.value.setZoom(+1); } };
        const zoomOut = () => { if (map.value?.setZoom) { isZooming.value = true; map.value.setZoom(-1); } };

        const moveToBuilding = () => {
            const gps = buildingGPS.value;
            if (map.value && gps?.lat && gps?.lon)
                map.value.setCenterLonLat(gps.lon, gps.lat);
        };

        const moveToRadarLocation = () => {};

        /* ── CSV 다운로드 ── */
        const downloadCSV = () => {
            const ships = displayedShips.value;
            if (ships.length === 0) return;
            const header = ['선박명', 'MMSI', '위도', '경도', 'SOG', 'COG', 'HEADING', '최근수신'];
            const rows = ships.map(s => [s.name || '', s.mmsi, s.lat, s.lon, s.sog, s.cog, s.heading, fmtTime(s.timestamp)]);
            const csv = [header, ...rows].map(r => r.join(',')).join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `ais_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        };

        /* ── 설정 다이얼로그 ── */
        const openIPDialog = () => {
            aisIP.value      = store.getters.getAISIP || '';
            aisPort.value    = store.getters.getAISPort || 0;
            aisWSPort.value  = store.getters.getAISWSPort || 0;
            radar1IP.value   = store.getters.getRadar1IP || 'localhost';
            radar1Port.value = store.getters.getRadar1Port || 7300;
            radar1WSPort.value = store.getters.getRadar1WSPort || 7100;
            radar2IP.value   = store.getters.getRadar2IP || 'localhost';
            radar2Port.value = store.getters.getRadar2Port || 7301;
            radar2WSPort.value = store.getters.getRadar2WSPort || 7101;
            store.dispatch('getExternalApiSetting').catch(() => {}).finally(() => {
                externalApiIp.value   = store.getters.getExternalApiIp   || '118.40.116.129';
                externalApiPort.value = store.getters.getExternalApiPort || 24010;
            });
            ipDialog.value = true;
        };

        const saveIPSetting = () => {
            store.dispatch('setIPSetting', {
                aisIP:       aisIP.value,
                aisPort:     aisPort.value,
                aisWSPort:   aisWSPort.value,
                radar1IP:    radar1IP.value,
                radar1Port:  radar1Port.value,
                radar1WSPort: radar1WSPort.value,
                radar2IP:    radar2IP.value,
                radar2Port:  radar2Port.value,
                radar2WSPort: radar2WSPort.value,
            });
            store.dispatch('setExternalApiSetting', {
                externalApiIp:   externalApiIp.value,
                externalApiPort: externalApiPort.value,
            }).catch(() => {});
            ipDialog.value = false;
        };

        const openBuildingGPSDialog = () => {
            buildingGPSForm.value = { lat: buildingGPS.value?.lat || 35.1358, lon: buildingGPS.value?.lon || 129.07 };
            buildingGPSDialog.value = true;
        };
        const saveBuildingGPS = async () => {
            await store.dispatch('setBuildingGPS', buildingGPSForm.value);
            buildingGPSDialog.value = false;
        };

        const openAISCommunicationDialog = async () => {
            try {
                await store.dispatch('getSerialPorts');
                const cfg = await store.dispatch('getAISCommunicationConfig');
                communicationType.value = cfg.type ?? 0;

                // 신형: serialPorts 배열 우선, 없으면 legacy serialPort 를 배열로 감싸기
                if (Array.isArray(cfg.serialPorts) && cfg.serialPorts.length > 0) {
                    selectedSerialPorts.value = [...cfg.serialPorts];
                } else if (cfg.serialPort) {
                    selectedSerialPorts.value = [cfg.serialPort];
                } else {
                    selectedSerialPorts.value = [];
                }

                tcpIp.value  = cfg.tcpIp  || '127.0.0.1';
                tcpPort.value = cfg.tcpPort || 4001;
                await store.dispatch('getAISCommunicationStatus');
            } catch { /* ignore */ }
            aisCommunicationDialog.value = true;
        };

        const saveAISCommunicationConfig = async () => {
            try {
                // 수동 입력 중인 포트가 있으면 자동으로 추가
                addManualPort();
                const cfg = { type: communicationType.value };
                if (communicationType.value === 0) {
                    cfg.serialPorts = [...selectedSerialPorts.value];
                    // 호환: 첫 번째 포트는 legacy 필드에도 넣어둔다
                    if (cfg.serialPorts.length > 0) cfg.serialPort = cfg.serialPorts[0];
                } else {
                    cfg.tcpIp = tcpIp.value;
                    cfg.tcpPort = parseInt(tcpPort.value);
                }
                await store.dispatch('updateAISCommunicationConfig', cfg);

                setTimeout(async () => {
                    await store.dispatch('getAISCommunicationStatus');
                }, 2000);

                alert('통신 설정이 저장되었습니다.');
            } catch { alert('저장 실패'); }
            aisCommunicationDialog.value = false;
        };

        /* ── 지도 이벤트 ── */
        const handleClick = (e) => { clickedX.value = e.clientX; clickedY.value = e.clientY; };
        const changeCenter = (data) => { offsetX.value = data.offsetX; offsetY.value = data.offsetY; };

        const setupCanvas = () => {
            const el = document.getElementById('container');
            if (!el) return;
            centerX.value = el.offsetWidth  / 2;
            centerY.value = el.offsetHeight / 2;
        };

        /* ── setMap: 카카오 adapter를 수신 ── */
        const setMap = (mapData) => {
            resolution.value = mapData.resolution;
            map.value        = mapData.map;
            if (buildingGPS.value?.lat && buildingGPS.value?.lon)
                centerPixel.value = map.value?.getPixelFromLonLat(buildingGPS.value.lon, buildingGPS.value.lat);
        };

        const toggleRadar = (v) => store.commit('setShowRadar', v);

        /* ── 포맷 헬퍼 ── */
        const fmtGps   = (g) => g?.lat ? `${Number(g.lat).toFixed(4)}, ${Number(g.lon).toFixed(4)}` : '—';
        const fmtCoord = (v, dec = 5) => v != null ? Number(v).toFixed(dec) : '—';
        const fmtLatLon = (lat, lon) => lat && lon ? `${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}` : '—';
        const fmtSog = (sog) => {
            if (sog == null) return '0';
            const s = parseFloat(sog);
            return isNaN(s) ? '0' : s < 0.1 ? '0' : s.toFixed(1);
        };
        const fmtTime = (ts) => {
            if (!ts) return '—';
            const d = new Date(ts);
            return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        };
        const fmtHistoryTime = (ts) => {
            if (!ts) return '—';
            const d = new Date(ts);
            const p = (v) => String(v).padStart(2, '0');
            return `${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
        };
        const fmtDist = (d) => d != null ? `${Number(d).toFixed(0)} m` : '—';
        const shipAgeClass = (ship) => {
            if (!ship.timestamp) return 'sdot--on';
            return Date.now() - ship.timestamp > 4*60*1000 ? 'sdot--idle' : 'sdot--on';
        };

        /* ── watch ── */
        watch(selectedMMSI, (mmsi) => {
            if (!mmsi) {
                selectedAIS.value = null;
                store.commit('setAISDateData', []); // 선박 해제 시 항적 데이터 클리어
                return;
            }
            const found = displayedShips.value.find(s => String(s.mmsi) === String(mmsi));
            if (found) selectedAIS.value = found;
        });

        // 드로어 열림/닫힘 애니메이션(240ms) 동안 AISCanvas 숨겨 선박 어긋남 방지
        let drawerAnimTimer = null;
        watch(drawerOpen, () => {
            if (drawerAnimTimer) clearTimeout(drawerAnimTimer);
            isZooming.value = true;
            drawerAnimTimer = setTimeout(() => {
                isZooming.value = false;
                drawerAnimTimer = null;
            }, 280);
        });

        let statusInterval = null;
        watch(() => aisCommunicationDialog.value, (open) => {
            if (open) statusInterval = setInterval(() => store.dispatch('getAISCommunicationStatus'), 3000);
            else { clearInterval(statusInterval); statusInterval = null; }
        });

        /* ── 생명주기 ── */
        onMounted(() => {
            nextTick(setupCanvas);
            store.dispatch('getBuildingGPS');
            updateClock();
            clockInterval = setInterval(updateClock, 1000);
        });

        onBeforeUnmount(() => {
            clearInterval(clockInterval);
            clearInterval(statusInterval);
            if (drawerAnimTimer) clearTimeout(drawerAnimTimer);
        });

        return {
            /* 지도 */
            centerX, centerY, offsetX, offsetY, clickedX, clickedY,
            resolution, map, centerPixel, isZooming, handleClick, changeCenter, setMap,
            /* GPS */
            buildingGPS, showRadar, alertAISError,
            moveToBuilding, moveToRadarLocation, toggleRadar, zoomIn, zoomOut,
            /* UI 토글 */
            drawerOpen, activeDrawerTab, settingsPanelOpen,
            searchActive, periodActive, alertActive, trackActive,
            showDatePicker, toggleSearch, togglePeriod, toggleDrawer, setDrawerTab,
            /* 선박 */
            selectedAIS, selectedMMSI, displayedShips, aisCount,
            drawerTabs, clickShip, onMapSelectAIS, centerOnShip, downloadCSV,
            /* 날짜/검색 */
            searchQuery, startDate, endDate, filterDateLabel, trackRangeLabel,
            setDatePreset, applyDateFilter, clearDateFilter, fetchTrackData,
            /* 항적 */
            trackData, trackSummary, trackHasNext, loadMoreHistory,
            realtimeTrackSummary, realtimeRangeLabel,
            /* 설정 */
            currentTime, ipDialog, openIPDialog, saveIPSetting,
            aisIP, aisPort, aisWSPort, radar1IP, radar1Port, radar1WSPort,
            radar2IP, radar2Port, radar2WSPort, externalApiIp, externalApiPort,
            buildingGPSDialog, buildingGPSForm, openBuildingGPSDialog, saveBuildingGPS,
            aisCommunicationDialog, communicationType,
            selectedSerialPorts, manualPortInput, addManualPort,
            serialPorts, tcpIp, tcpPort,
            openAISCommunicationDialog, saveAISCommunicationConfig,
            aisCommunicationStatus,
            /* 포맷 */
            fmtGps, fmtCoord, fmtLatLon, fmtSog, fmtTime, fmtHistoryTime, fmtDist, shipAgeClass,
        };
    },
};
</script>

<style scoped>
@import "@/assets/css/bootstrap_css/bootstrap.min.css";
@import "@/assets/css/_global.css";

.ais-layout {
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    background: var(--sr-bg-primary);
    color: var(--sr-text-primary);
    font-family: 'Pretendard', 'Noto Sans KR', -apple-system, sans-serif;
    overflow: hidden;
}
.mono { font-family: 'Courier New', Courier, monospace; }

/* ── 최상단 헤더 ── */
.topbar {
    height: 44px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px;
    background: var(--sr-bg-panel);
    border-bottom: 1px solid var(--sr-border);
    z-index: 2000;
}
.topbar-left  { display: flex; align-items: center; gap: 12px; }
.topbar-right { display: flex; align-items: center; gap: 12px; }
.topbar-logo  { font-weight: 700; font-size: 14px; letter-spacing: 0.12em; color: var(--sr-accent); }
.topbar-sub   { font-size: 12px; color: var(--sr-text-secondary); }
.topbar-time  { font-size: 11px; color: var(--sr-text-secondary); }
.live-badge {
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    padding: 2px 8px; border-radius: 3px;
    background: rgba(6,182,212,0.12); border: 1px solid var(--sr-accent); color: var(--sr-accent);
}
.live-badge--err {
    background: rgba(239,68,68,0.12); border-color: var(--sr-danger); color: var(--sr-danger);
    animation: blink 1.2s ease-in-out infinite;
}
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ── 본문 ── */
.body { flex: 1; position: relative; overflow: hidden; }

/* ── 좌측 아이콘 레일 ── */
.icon-rail {
    position: absolute; left: 0; top: 0; bottom: 0; width: 80px;
    z-index: 1000;
    background: var(--sr-bg-panel); border-right: 1px solid var(--sr-border);
    display: flex; flex-direction: column; align-items: center;
    padding: 8px 0; gap: 6px;
}
.rail-btn {
    position: relative; width: 66px; height: 66px;
    background: transparent; border: 1px solid transparent; border-radius: 8px;
    cursor: pointer; color: var(--sr-text-secondary);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 4px; padding: 0; transition: all 0.15s;
}
.rail-btn:hover { background: var(--sr-bg-hover); border-color: var(--sr-border); color: var(--sr-text-primary); }
.rail-btn--on   { background: var(--sr-accent-dim); border-color: var(--sr-accent); color: var(--sr-text-primary); }
.rail-btn--warn { border-color: var(--sr-danger) !important; }
.rail-glyph { font-size: 22px; line-height: 1; }
.rail-lbl   { font-size: 11px; letter-spacing: 0.04em; }
.glyph-warn { color: var(--sr-danger); }
.rail-badge {
    position: absolute; top: 6px; right: 6px;
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--sr-danger); border: 1.5px solid var(--sr-bg-panel);
}
.rail-period-badge {
    position: absolute; top: 4px; right: 4px;
    font-size: 7px; font-weight: 700; letter-spacing: 0.05em;
    padding: 1px 3px; border-radius: 2px;
    background: var(--sr-accent); color: #000;
}

/* ── 좌측 설정 슬라이드 패널 ── */
.lpanel {
    position: absolute; left: 80px; top: 0; bottom: 0; width: 260px;
    z-index: 999;
    background: var(--sr-bg-panel); border-right: 1px solid var(--sr-border);
    display: flex; flex-direction: column;
    transform: translateX(-260px);
    transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}
.lpanel--open { transform: translateX(0); }
.lpanel-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-bottom: 1px solid var(--sr-border);
    font-size: 13px; font-weight: 600; color: var(--sr-accent); flex-shrink: 0;
}
.close-btn {
    background: transparent; border: none; color: var(--sr-text-secondary);
    padding: 0; width: 24px; height: 24px; font-size: 14px; cursor: pointer;
    border-radius: 4px; display: flex; align-items: center; justify-content: center;
}
.close-btn:hover { background: var(--sr-bg-hover); color: var(--sr-text-primary); }
.lpanel-body { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 0; }
.lp-section  { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; }
.lp-section-ttl {
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--sr-accent); border-bottom: 1px solid var(--sr-border); padding-bottom: 4px;
}
.lp-row { display: flex; align-items: center; gap: 6px; min-height: 26px; }
.lp-key { font-size: 11px; color: var(--sr-text-secondary); flex-shrink: 0; min-width: 52px; }
.lp-val { font-size: 11px; color: var(--sr-text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-sep { height: 1px; background: var(--sr-border); margin: 0 -14px; }

/* ── 경보 오버레이 ── */
.alert-overlay {
    position: absolute;
    top: 14px; left: 50%; transform: translateX(-50%);
    z-index: 600;
    display: flex; align-items: center; gap: 8px;
    padding: 8px 20px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid var(--sr-danger);
    border-radius: 6px;
    color: var(--sr-danger);
    font-size: 12px; font-weight: 600;
    backdrop-filter: blur(6px);
    box-shadow: 0 2px 12px rgba(239,68,68,0.3);
    white-space: nowrap;
    animation: blink 2s ease-in-out infinite;
}
.alert-overlay-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--sr-danger); flex-shrink: 0;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── 공통 버튼 ── */
.xs-btn {
    background: var(--sr-bg-surface); color: var(--sr-text-primary);
    border: 1px solid var(--sr-border); border-radius: 4px;
    padding: 2px 8px; font-size: 11px; height: 22px;
    cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all 0.12s;
}
.xs-btn:hover { border-color: var(--sr-accent); background: var(--sr-bg-hover); }
.danger-btn { border-color: var(--sr-border); }
.danger-btn:hover { border-color: var(--sr-danger) !important; color: var(--sr-danger); }
.full-btn {
    width: 100%; background: var(--sr-bg-surface); color: var(--sr-text-primary);
    border: 1px solid var(--sr-border); border-radius: 4px;
    padding: 4px 0; font-size: 11px; height: 26px; cursor: pointer; transition: all 0.12s;
}
.full-btn:hover { border-color: var(--sr-accent); background: var(--sr-bg-hover); }
.primary-btn { background: var(--sr-accent-dim); border-color: var(--sr-accent); }
.primary-btn:hover { background: var(--sr-accent); }

/* ── 기간 오버레이 (좌상단) ── */
.overlay-tl {
    position: absolute; left: 88px; top: 8px;
    z-index: 500; display: flex; flex-direction: column; gap: 4px;
}
.date-bar {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px;
    background: rgba(15,23,42,0.88); backdrop-filter: blur(4px);
    border: 1px solid var(--sr-border); border-radius: 6px; font-size: 12px;
}
.date-bar-range { color: var(--sr-text-primary); letter-spacing: 0.02em; }
.date-picker-panel {
    background: var(--sr-bg-panel); border: 1px solid var(--sr-border);
    border-radius: 6px; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 6px; min-width: 220px;
}
.dp-row  { display: flex; align-items: center; gap: 8px; }
.dp-lbl  { font-size: 10px; color: var(--sr-text-secondary); width: 28px; flex-shrink: 0; }
.dp-input {
    flex: 1; background: var(--sr-bg-surface); color: var(--sr-text-primary);
    border: 1px solid var(--sr-border); border-radius: 4px;
    padding: 3px 6px; font-size: 11px; font-family: 'Courier New', monospace;
}
.dp-shortcuts { display: flex; gap: 4px; }
.chip-btn {
    flex: 1; background: var(--sr-bg-surface); color: var(--sr-text-secondary);
    border: 1px solid var(--sr-border); border-radius: 12px;
    padding: 2px 0; font-size: 10px; height: 20px; cursor: pointer; transition: all 0.12s;
}
.chip-btn:hover { border-color: var(--sr-accent); color: var(--sr-accent); }

/* ── 검색 + 지도 도구 (우상단) ── */
.overlay-tr {
    position: absolute; right: 8px; top: 8px;
    z-index: 500; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
}
.search-box {
    display: flex; align-items: center; gap: 6px; padding: 5px 10px;
    background: rgba(15,23,42,0.88); backdrop-filter: blur(4px);
    border: 1px solid var(--sr-border); border-radius: 6px; min-width: 200px;
}
.search-icon  { font-size: 14px; color: var(--sr-text-secondary); flex-shrink: 0; }
.search-input { flex: 1; background: transparent; border: none; outline: none; color: var(--sr-text-primary); font-size: 12px; font-family: inherit; }
.search-input::placeholder { color: var(--sr-text-dim); }
.map-tools { display: flex; flex-direction: column; gap: 3px; }
.map-tool {
    width: 32px; height: 32px;
    background: rgba(15,23,42,0.88); backdrop-filter: blur(4px);
    border: 1px solid var(--sr-border); border-radius: 5px;
    color: var(--sr-text-primary); font-size: 14px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    padding: 0; transition: all 0.12s;
}
.map-tool:hover { border-color: var(--sr-accent); background: var(--sr-bg-surface); }

/* ── 하단 플로팅 드로어 ── */
.bottom-drawer {
    position: absolute; left: 92px; right: 12px; bottom: 0;
    z-index: 900;
    background: var(--sr-bg-panel);
    border: 1px solid var(--sr-border); border-bottom: none;
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -6px 32px rgba(0,0,0,0.45), 0 -2px 8px rgba(0,0,0,0.3);
    display: flex; flex-direction: column;
    transition: height 0.24s cubic-bezier(0.4, 0, 0.2, 1);
    height: 42px; overflow: hidden;
}
.bottom-drawer--open { height: 340px; }

.drawer-hdr {
    height: 42px; flex-shrink: 0;
    display: flex; align-items: center;
    border-bottom: 1px solid var(--sr-border);
    border-radius: 12px 12px 0 0;
    padding: 0 4px 0 0;
}
.handle-wrap { width: 36px; height: 100%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.handle-bar  { width: 20px; height: 3px; background: var(--sr-border); border-radius: 2px; }

.drawer-tabs { flex: 1; display: flex; align-items: stretch; height: 100%; overflow: hidden; }
.dtab {
    display: flex; align-items: center; gap: 5px; padding: 0 16px;
    background: transparent; border: none; border-bottom: 2px solid transparent;
    color: var(--sr-text-secondary); font-size: 12px; font-weight: 500;
    cursor: pointer; white-space: nowrap; transition: all 0.15s; height: 100%;
}
.dtab:hover { color: var(--sr-text-primary); }
.dtab--on   { color: var(--sr-text-primary); border-bottom-color: var(--sr-accent); font-weight: 600; }
.dtab-dot   { width: 6px; height: 6px; border-radius: 50%; background: #fb923c; flex-shrink: 0; }

.drawer-hdr-right { display: flex; align-items: center; gap: 6px; padding: 0 8px; flex-shrink: 0; }
.hdr-btn {
    background: var(--sr-bg-surface); color: var(--sr-text-secondary);
    border: 1px solid var(--sr-border); border-radius: 4px;
    padding: 2px 8px; font-size: 11px; height: 22px;
    cursor: pointer; white-space: nowrap; transition: all 0.12s;
}
.hdr-btn:hover { border-color: var(--sr-accent); color: var(--sr-text-primary); }

.drawer-body { flex: 1; overflow: hidden; min-height: 0; }
.dpane { height: 100%; overflow: hidden; }

/* ── 리스트 탭 ── */
.dpane--split { display: grid; grid-template-columns: 1fr 280px; }
.list-col  { height: 100%; overflow: hidden; border-right: 1px solid var(--sr-border); }
.list-scroll { height: 100%; overflow-y: auto; padding-bottom: 16px; box-sizing: border-box; }
.list-scroll::-webkit-scrollbar { width: 4px; }
.list-scroll::-webkit-scrollbar-thumb { background: var(--sr-border); border-radius: 3px; }

.ship-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.ship-tbl thead tr { background: rgba(15,23,42,0.6); position: sticky; top: 0; z-index: 1; }
.ship-tbl th {
    padding: 7px 12px; font-size: 10px; font-weight: 700;
    letter-spacing: 0.07em; text-transform: uppercase;
    color: var(--sr-text-secondary); text-align: left;
    border-bottom: 1px solid var(--sr-border); white-space: nowrap;
}
.ship-tbl td { padding: 6px 12px; }
.ship-row { border-bottom: 1px dashed rgba(30,58,95,0.7); cursor: pointer; transition: background 0.1s; }
.ship-row:hover     { background: rgba(6,182,212,0.05); }
.ship-row--sel      { background: rgba(251,146,60,0.08); }
.ship-row--sel:hover { background: rgba(251,146,60,0.12); }
.sdot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.sdot--on   { background: var(--sr-accent); }
.sdot--idle { background: var(--sr-text-dim); }
.sdot--sel  { background: #fb923c; }
.td-name { font-weight: 600; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-dim  { color: var(--sr-text-secondary); font-size: 11px; }
.td-sog  { color: var(--sr-text-primary); font-weight: 600; }
.empty-row { text-align: center; padding: 24px; color: var(--sr-text-dim); font-size: 12px; }

/* ── 우측 상세 패널 ── */
.detail-col {
    height: 100%; overflow-y: auto; padding: 14px 16px;
    box-sizing: border-box; display: flex; flex-direction: column; gap: 0;
}
.detail-col::-webkit-scrollbar { width: 4px; }
.detail-col::-webkit-scrollbar-thumb { background: var(--sr-border); border-radius: 3px; }
.det-hdr { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--sr-border); display: flex; flex-direction: column; gap: 8px; }
.det-title-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.det-dot-icon  { font-size: 13px; color: #fb923c; flex-shrink: 0; }
.det-name      { font-size: 14px; font-weight: 700; color: var(--sr-text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; padding: 2px 6px; border-radius: 3px; flex-shrink: 0; }
.tag--gray   { background: rgba(148,163,184,0.15); border: 1px solid rgba(148,163,184,0.3); color: var(--sr-text-secondary); }
.tag--orange { background: rgba(251,146,60,0.15);  border: 1px solid rgba(251,146,60,0.4);  color: #fb923c; }
.det-actions { display: flex; gap: 6px; }
.det-grid    { display: flex; flex-direction: column; gap: 0; }
.det-row     { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dotted rgba(30,58,95,0.6); }
.det-row:last-child { border-bottom: none; }
.det-k { font-size: 10px; color: var(--sr-text-secondary); text-transform: uppercase; letter-spacing: 0.07em; flex-shrink: 0; }
.det-v { font-size: 11px; color: var(--sr-text-primary); text-align: right; font-weight: 500; }
.det-empty { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 11px; color: var(--sr-text-dim); line-height: 1.8; }

/* ── 항적 요약 탭 ── */
.dpane--summary { padding: 14px 18px; display: flex; flex-direction: column; overflow: hidden; gap: 12px; }
.tl-hdr { display: flex; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--sr-border); flex-shrink: 0; }
.tl-hdr-name  { font-size: 13px; font-weight: 700; color: var(--sr-text-primary); }
.tl-hdr-range { font-size: 10px; color: var(--sr-text-secondary); flex: 1; }
.tl-hint      { font-size: 10px; color: var(--sr-warning); }
.tl-empty { text-align: center; font-size: 11px; color: var(--sr-text-dim); padding: 24px; }
.sum-grid { display: flex; flex-direction: column; gap: 0; }
.sum-row  { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px dotted rgba(30,58,95,0.6); }
.sum-row:last-child { border-bottom: none; }
.sum-k { font-size: 11px; color: var(--sr-text-secondary); text-transform: uppercase; letter-spacing: 0.06em; flex-shrink: 0; }
.sum-v { font-size: 12px; color: var(--sr-text-primary); font-weight: 500; text-align: right; }

/* ── 과거 이력 탭 ── */
.dpane--history { display: flex; flex-direction: column; overflow: hidden; padding: 14px 18px; gap: 10px; }
.history-hdr    { display: flex; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--sr-border); flex-shrink: 0; }
.history-scroll { flex: 1; overflow-y: auto; padding-bottom: 8px; }
.history-scroll::-webkit-scrollbar { width: 4px; }
.history-scroll::-webkit-scrollbar-thumb { background: var(--sr-border); border-radius: 3px; }
.load-more-row { display: flex; justify-content: center; padding: 10px; }
.load-more-btn { min-width: 140px; height: 26px; }
.load-more-end { font-size: 10px; color: var(--sr-text-dim); align-items: center; }
</style>
