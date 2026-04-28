<template>
  <div style="width: 100%; height: 100%">
    <!-- 지도 컨테이너 -->
    <div
      id="chart"
      ref="chart"
      style="width: 100%; height: 100%;"
    ></div>

    <!-- IP 설정 다이얼로그 (원본 유지) -->
    <v-dialog v-model="ipDialog" max-width="500">
      <v-card>
        <v-card-title>IP 설정</v-card-title>
        <v-card-text>
          <v-form>
            <v-text-field
              v-model="aisIP"
              label="AIS IP 주소"
              placeholder="예: 192.168.0.10"
              outlined
              dense
            />
            <v-text-field
              v-model="aisPort"
              label="AIS Port"
              type="number"
              placeholder="예: 5000"
              outlined
              dense
            />
            <v-text-field
              v-model="aisWSPort"
              label="AIS WS Port"
              type="number"
              placeholder="예: 5000"
              outlined
              dense
            />

            <v-divider class="my-3"></v-divider>
            <v-text-field
              v-model="externalApiIp"
              label="중앙서버 IP 주소"
              placeholder="예: 118.40.116.129"
              outlined
              dense
            />
            <v-text-field
              v-model="externalApiPort"
              label="중앙서버 Port"
              type="number"
              placeholder="예: 24010"
              outlined
              dense
            />
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" text @click="ipDialog = false">취소</v-btn>
          <v-btn color="primary" @click="setIPSetting">저장</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import { onMounted, ref, watch, onBeforeUnmount } from "vue";
import { useStore } from "vuex";

export default {
  props: {
    width: { type: Number, default: 700 },
    height: { type: Number, default: 700 },
  },
  name: "ElectronicChart",
  setup(props, { emit }) {
    const store = useStore();

    const chart = ref(null);

    // 기존 코드에서 AIS GPS를 "지도 중심/이동 기준"으로 사용했으므로 유지
    const aisGPS = ref({ lat: 37.5665, lon: 126.9780, heading: 0 });

    // UI 상태
    const ipDialog = ref(false);

    // 설정값들(원본 유지)
    const aisIP = ref(0);
    const aisPort = ref(0);
    const aisWSPort = ref(0);

    const externalApiIp = ref("118.40.116.129");
    const externalApiPort = ref(24010);

    // 카카오맵 인스턴스
    let kakaoMap = null;

    // adapter를 한 번만 만들어 재사용 — props.map 참조 identity가 바뀌면
    // AISCanvas의 watch가 불필요하게 재트리거되며 렌더 더 끊긴다.
    let mapAdapter = null;

    // RAF 코얼레싱 — 드래그 중 center_changed가 초당 수십 번 터져도 프레임당 1회만 emit
    let emitPending = false;

    // 카카오 level → meters-per-pixel 근사 (레이더 원형 픽셀 사이즈 계산에 필요)
    const metersPerPixel = (lat, level) => {
      const zoom = 19 - level; // 경험적 근사
      return 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
    };

    // adapter를 한 번만 생성 — 이후 매 이벤트마다 재사용
    const ensureAdapter = () => {
      if (mapAdapter || !kakaoMap) return mapAdapter;
      mapAdapter = {
        getPixelFromLonLat(_lon, _lat) {
          const proj = kakaoMap.getProjection();
          const ll = new window.kakao.maps.LatLng(_lat, _lon);
          const p = proj.containerPointFromCoords(ll);
          return [p.x, p.y];
        },
        setCenterLonLat(_lon, _lat) {
          kakaoMap.setCenter(new window.kakao.maps.LatLng(_lat, _lon));
          emitMapData();
        },
        getViewportSize() {
          const r = chart.value?.getBoundingClientRect();
          return [r?.width || 0, r?.height || 0];
        },
        getLevel() {
          return kakaoMap.getLevel();
        },
        getResolution() {
          return metersPerPixel(kakaoMap.getCenter().getLat(), kakaoMap.getLevel());
        },
        // 줌 제어: delta > 0 이면 줌인(level 감소), delta < 0 이면 줌아웃(level 증가)
        setZoom(delta) {
          if (!kakaoMap) return;
          const current = kakaoMap.getLevel();
          kakaoMap.setLevel(Math.max(1, Math.min(14, current - delta)));
          emitMapData();
        },
      };
      return mapAdapter;
    };

    const emitMapDataImmediate = () => {
      if (!kakaoMap) return;

      const center = kakaoMap.getCenter();
      const level = kakaoMap.getLevel();

      const lat = center.getLat();
      const lon = center.getLng();

      // store에 지도 중심 반영 (AISCanvas fallback 로직에서 사용)
      store.commit("setMapCenterGPS", { lat, lon });

      const adapter = ensureAdapter();

      // 현재 aisGPS 위치의 픽셀도 같이 계산해서 내려줌(기존 centerPixel 컨셉 유지)
      const centerPixel = adapter.getPixelFromLonLat(aisGPS.value.lon, aisGPS.value.lat);

      emit("setMap", {
        resolution: metersPerPixel(lat, level), // meters per pixel
        map: adapter,                            // 기존 키명 "map" 유지 + 참조 안정
        centerPixel,
      });
    };

    // 프레임당 1회로 emit 코얼레싱
    const emitMapData = () => {
      if (emitPending) return;
      emitPending = true;
      requestAnimationFrame(() => {
        emitPending = false;
        emitMapDataImmediate();
      });
    };

    const setMapInit = () => {
      if (!window.kakao?.maps) {
        throw new Error("Kakao Maps SDK not loaded. public/index.html을 확인하세요.");
      }
      if (!chart.value) return;

      // 초기 중심: 건물 위치 우선, 없으면 mapCenterGPS, 없으면 aisGPS 기본값
      const buildingGPS = store.getters.getBuildingGPS;
      const mapCenter = store.getters.getMapCenterGPS;
      const initial = buildingGPS || mapCenter || aisGPS.value;

      kakaoMap = new window.kakao.maps.Map(chart.value, {
        center: new window.kakao.maps.LatLng(initial.lat, initial.lon),
        level: 5,
      });

      // 드래그 중에도 실시간으로 따라오게 — center_changed / zoom_changed 는
      // 이동이 끝나기 전에도 fires. idle 은 최종 정합성 보장용.
      window.kakao.maps.event.addListener(kakaoMap, "zoom_start", () => emit("zoomStart"));
      window.kakao.maps.event.addListener(kakaoMap, "idle", () => { emit("zoomEnd"); emitMapData(); });
      window.kakao.maps.event.addListener(kakaoMap, "center_changed", emitMapData);
      window.kakao.maps.event.addListener(kakaoMap, "zoom_changed", emitMapData);

      // 첫 emit 은 즉시 (RAF 대기 없이) 초기 셋업을 바로 내려줌
      emitMapDataImmediate();
    };

    const moveToCurrentLocation = () => {
      if (!kakaoMap) return;
      // 현재 aisGPS 기준으로 이동(원본 로직 유지)
      kakaoMap.setCenter(new window.kakao.maps.LatLng(aisGPS.value.lat, aisGPS.value.lon));
      emitMapData();
    };

    const getIPsetting = async () => {
      aisIP.value = store.getters.getAISIP;
      aisPort.value = store.getters.getAISPort;
      aisWSPort.value = store.getters.getAISWSPort;

      await store.dispatch("getExternalApiSetting");
      externalApiIp.value = store.getters.getExternalApiIp || "118.40.116.129";
      externalApiPort.value = store.getters.getExternalApiPort || 24010;
    };

    const setIPSetting = async () => {
      store.dispatch("setIPSetting", {
        aisIP: aisIP.value,
        aisPort: aisPort.value,
        aisWSPort: aisWSPort.value,
      });

      await store.dispatch("setExternalApiSetting", {
        externalApiIp: externalApiIp.value,
        externalApiPort: externalApiPort.value,
      });

      ipDialog.value = false;
    };

    // props width/height 변경 시 카카오맵 relayout 필요
    watch(
      () => [props.width, props.height],
      () => {
        if (kakaoMap) {
          kakaoMap.relayout();
          emitMapData();
        }
      }
    );

    // 기존 코드: AIS GPS 변경 시 지도 중심 이동
    watch(
      () => store.getters.getAISGPS,
      (gps) => {
        if (gps && gps.lat && gps.lon) {
          // 실제로 값이 달라졌을 때만 반영
          if (
            Math.abs(aisGPS.value.lat - gps.lat) > 0.0001 ||
            Math.abs(aisGPS.value.lon - gps.lon) > 0.0001
          ) {
            aisGPS.value = { ...gps };
            if (kakaoMap) {
              kakaoMap.setCenter(new window.kakao.maps.LatLng(aisGPS.value.lat, aisGPS.value.lon));
              emitMapData();
            }
          }
        }
      }
    );

    const waitForKakaoReady = () =>
      new Promise((resolve, reject) => {
        const check = (attempt = 0) => {
          if (attempt > 50) { // 5초 대기 후 포기
            reject(new Error("Kakao Maps SDK 로딩 시간 초과. public/index.html의 스크립트 태그를 확인하세요."));
            return;
          }
          if (!window.kakao) {
            setTimeout(() => check(attempt + 1), 100);
            return;
          }
          if (window.kakao.maps && typeof window.kakao.maps.load === "function") {
            window.kakao.maps.load(() => resolve());
            return;
          }
          if (window.kakao.maps) {
            resolve();
            return;
          }
          setTimeout(() => check(attempt + 1), 100);
        };
        check();
      });

onMounted(async () => {
  // 1) 초기 AIS GPS 로드
  try {
    const gps = await store.dispatch("getAISGPS");
    if (gps && gps.lat && gps.lon) {
      aisGPS.value = gps;
    }
  } catch (e) {
    // GPS 로드 실패해도 지도는 띄울 수 있으니 무시 가능
    console.warn("getAISGPS failed:", e);
  }

  // 2) Kakao SDK 준비 대기 후 지도 초기화
  try {
    await waitForKakaoReady();
    setMapInit();
  } catch (e) {
    console.error(e);
    alert(e.message || "Kakao Maps SDK 로딩 실패");
    return;
  }

  // 3) IP 설정 로드
  getIPsetting();
});


    onBeforeUnmount(() => {
      // 카카오맵 이벤트 제거는 제한적이라 보통 GC에 맡깁니다.
      // 필요 시 mapEl을 제거하는 것으로 충분합니다.
      kakaoMap = null;
      mapAdapter = null;
    });

    return {
      chart,
      ipDialog,
      moveToCurrentLocation,

      aisIP,
      aisPort,
      aisWSPort,

      externalApiIp,
      externalApiPort,

      setIPSetting,
    };
  },
};
</script>

<style scoped>
</style>
