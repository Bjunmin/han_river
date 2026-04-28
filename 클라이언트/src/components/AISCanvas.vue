<template>
    <canvas
        id="aisCanvas"
        ref="aisCanvas"
        :width="1200"
        :height="1200"
        style="
            position: absolute;
            z-index: 11;
            pointer-events: none; /* 마우스 이벤트 차단 */
        "
    ></canvas>

    <div
        v-if="!isHiding && isShowShipBox"
        id="infoBox"
        style="width: 200px; position: absolute;"
        :style="shipInfoBoxStyle"
    >
        <table class="infoTable">
            <tbody>
                <tr>
                    <th>ID</th>
                    <td>{{ shipInfo.mmsi }}</td>
                </tr>
                <tr>
                    <th>위도</th>
                    <td>{{ shipInfo.lat }}</td>
                </tr>
                <tr>
                    <th>경도</th>
                    <td>{{ shipInfo.lon }}</td>
                </tr>
                <tr>
                    <th>거리</th>
                    <td>{{ shipInfo.distance }}</td>
                </tr>
                <tr>
                    <th>속도</th>
                    <td>{{ shipInfo.sog }}</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script>
import { onMounted, ref, computed, watch, onBeforeUnmount } from "vue";
import { useStore } from "vuex";

export default {
    props: {
        width: {
            type: Number,
            default: 700,
        },
        height: {
            type: Number,
            default: 700,
        },
        clickedX: {
            type: Number,
            default: 0,
        },
        clickedY: {
            type: Number,
            default: 0,
        },
        // px per meter (ElectronicChart에서 metersPerPixel로 내려줬다면 measure=1/resolution 구조 유지 가능)
        measure: {
            type: Number,
            default: 232,
        },
        map: {
            type: Object,
            required: false,
            default: null,
        },
        showTrack: {
            type: Boolean,
            default: true,
        },
        isHiding: {
            type: Boolean,
            default: false,
        },
    },
    name: "AISCanvas",
    setup(props, { emit }) {
        const store = useStore();

        const centerX = ref(0);
        const centerY = ref(0);

        const aisCanvas = ref(null);
        const canvasCtx = ref(null);

        const shipHeading = ref(0);
        const centerGPS = ref({ lat: 35.1358, lon: 129.07 });

        // 내 선박(= 레이더 GPS / buildingGPS 등)
        const myShipGPS = ref({ lat: 35.1358, lon: 129.07, heading: 0 });

        const shipBoxPosition = ref({ x: 0, y: 0 });
        const isShowShipBox = ref(false);
        const shipInfo = ref({});

        let unsubscribe = null;
        let redrawInterval = null; // 시간 기반 상태(색상/소멸) 갱신용 주기 타이머

        // ---- RAF throttle: 여러 트리거가 한 프레임에 몰려도 한 번만 그림 ----
        let drawPending = false;
        let rafHandle = 0;
        const requestDraw = () => {
            if (drawPending) return;
            drawPending = true;
            rafHandle = requestAnimationFrame(() => {
                drawPending = false;
                rafHandle = 0;
                if (!canvasCtx.value) return;
                drawAISShip();
                drawAISHistory();
                drawTargetAISHistory();
            });
        };

        const getAISData = () => store.getters.getAISData;

        const formatSpeed = (sog) => {
            if (sog === null || sog === undefined) return "0";
            const speed = parseFloat(sog);
            if (isNaN(speed)) return "0";
            return speed < 0.1 ? "0" : speed.toFixed(1);
        };

        const drawPoints = (points, color = "red") => {
            points.forEach((point) => {
                const { x, y } = convertGPSToCanvas(point);
                canvasCtx.value.beginPath();
                canvasCtx.value.arc(x, y, 2, 0, Math.PI * 2);
                canvasCtx.value.fillStyle = color;
                canvasCtx.value.fill();
                canvasCtx.value.closePath();
            });
        };

        const drawLines = (points, color = "#ff8484") => {
            canvasCtx.value.beginPath();
            canvasCtx.value.lineWidth = 2;
            for (let i = 0; i < points.length; i++) {
                const { x, y } = convertGPSToCanvas(points[i]);
                if (i === 0) canvasCtx.value.moveTo(x, y);
                else canvasCtx.value.lineTo(x, y);
            }
            canvasCtx.value.strokeStyle = color;
            canvasCtx.value.stroke();
        };

        const drawTargetAISHistory = () => {
            const aisData = store.getters.getAISDateData;
            drawPoints(aisData, "red");
            drawLines(aisData, "#ff9000");
        };

        const drawAISHistory = () => {
            if (!props.showTrack) return;
            const aisData = getAISData();
            const now = Date.now();

            aisData.forEach((ais) => {
                const currentPoint = ais.value[0];
                if (currentPoint && currentPoint.timestamp) {
                    const timeDiff = now - currentPoint.timestamp;
                    if (timeDiff > 4 * 60 * 1000) return; // 4분 이상 지난 AIS는 경로 제외
                }

                if (ais.value.length > 2) {
                    drawPoints(ais.value.slice(2));
                    drawLines(ais.value);
                }
            });
        };

        const getMapResolutionClamp = () => {
            if (!props.map) return 1;

            // 카카오 adapter: map.getResolution()
            if (typeof props.map.getResolution === "function") {
                const r = props.map.getResolution();
                const rr = r || 1;
                return rr > 2 ? 2 : rr;
            }

            // OpenLayers: map.getView().getResolution()
            if (props.map.getView && typeof props.map.getView === "function") {
                const view = props.map.getView();
                const r = view?.getResolution?.() || 1;
                return r > 2 ? 2 : r;
            }

            return 1;
        };

        const drawAISShip = () => {
            if (!canvasCtx.value) return;

            canvasCtx.value.clearRect(0, 0, centerX.value * 2, centerY.value * 2);

            const aisData = getAISData();
            const resolutionClamp = getMapResolutionClamp();
            const now = Date.now();

            aisData.forEach((pos) => {
                const { x, y } = convertGPSToCanvas(pos.value[0]);

                pos.value[0].x = x;
                pos.value[0].y = y;

                const posHeading =
                    pos.value[0].heading != null ? pos.value[0].heading : pos.value[0].cog;

                const radian =
                    (((posHeading - 90 - shipHeading.value) % 360) * Math.PI) / 180;

                const sideLength = 20 / resolutionClamp;
                const baseLength = 15 / resolutionClamp;
                const extensionLength = 20 / resolutionClamp;

                // 정점
                const apexX = x + sideLength * Math.cos(radian);
                const apexY = y + sideLength * Math.sin(radian);

                // 밑변
                const leftBaseX = x + (baseLength / 2) * Math.cos(radian + Math.PI / 2);
                const leftBaseY = y + (baseLength / 2) * Math.sin(radian + Math.PI / 2);
                const rightBaseX = x - (baseLength / 2) * Math.cos(radian + Math.PI / 2);
                const rightBaseY = y - (baseLength / 2) * Math.sin(radian + Math.PI / 2);

                // 무게중심
                const centroidX = (apexX + leftBaseX + rightBaseX) / 3;
                const centroidY = (apexY + leftBaseY + rightBaseY) / 3;

                const offX = x - centroidX;
                const offY = y - centroidY;

                const adjustedApexX = apexX + offX;
                const adjustedApexY = apexY + offY;
                const adjustedLeftBaseX = leftBaseX + offX;
                const adjustedLeftBaseY = leftBaseY + offY;
                const adjustedRightBaseX = rightBaseX + offX;
                const adjustedRightBaseY = rightBaseY + offY;

                const extendedX = adjustedApexX + extensionLength * Math.cos(radian);
                const extendedY = adjustedApexY + extensionLength * Math.sin(radian);

                // 시간 기준 색상 + 4분 필터
                const pointTime = pos.value[0].timestamp ?? 0;
                const timeDiff = now - pointTime;
                if (timeDiff > 4 * 60 * 1000) return;

                const color = timeDiff <= 2 * 60 * 1000 ? "#744444" : "red";

                // 선택 여부
                const selectedMMSI = store.getters.getSelectedMMSI;
                const isSelected = selectedMMSI === pos.value[0].mmsi;

                // 삼각형
                canvasCtx.value.beginPath();
                canvasCtx.value.moveTo(adjustedApexX, adjustedApexY);
                canvasCtx.value.lineTo(adjustedLeftBaseX, adjustedLeftBaseY);
                canvasCtx.value.lineTo(adjustedRightBaseX, adjustedRightBaseY);
                canvasCtx.value.closePath();

                canvasCtx.value.strokeStyle = color;
                canvasCtx.value.lineWidth = 3;
                canvasCtx.value.stroke();

                if (isSelected) {
                    const borderRadius = Math.max(sideLength, baseLength) + 15 / resolutionClamp;
                    canvasCtx.value.beginPath();
                    canvasCtx.value.arc(x, y, borderRadius, 0, 2 * Math.PI);
                    canvasCtx.value.strokeStyle = "#00ff00";
                    canvasCtx.value.lineWidth = 4;
                    canvasCtx.value.stroke();
                }

                // 연장선
                canvasCtx.value.beginPath();
                canvasCtx.value.setLineDash([4, 1.5]);
                canvasCtx.value.moveTo(adjustedApexX, adjustedApexY);
                canvasCtx.value.lineTo(extendedX, extendedY);
                canvasCtx.value.lineWidth = 3;
                canvasCtx.value.stroke();
                canvasCtx.value.setLineDash([]);

                // 예측 경로(서버 거리)
                if (pos.predictedDistance && pos.predictedDistance > 0) {
                    const pixelPerMeter = props.measure;
                    const predictedDistancePixels = pos.predictedDistance * pixelPerMeter;

                    const predictedEndX = adjustedApexX + predictedDistancePixels * Math.cos(radian);
                    const predictedEndY = adjustedApexY + predictedDistancePixels * Math.sin(radian);

                    canvasCtx.value.beginPath();
                    canvasCtx.value.setLineDash([8, 4]);
                    canvasCtx.value.moveTo(adjustedApexX, adjustedApexY);
                    canvasCtx.value.lineTo(predictedEndX, predictedEndY);
                    canvasCtx.value.strokeStyle = "#00ff00";
                    canvasCtx.value.lineWidth = 2;
                    canvasCtx.value.globalAlpha = 0.7;
                    canvasCtx.value.stroke();
                    canvasCtx.value.setLineDash([]);
                    canvasCtx.value.globalAlpha = 1.0;
                }
            });

            // 내 선박(초록 삼각형)
            if (myShipGPS.value && myShipGPS.value.lat && myShipGPS.value.lon) {
                const { x: myX, y: myY } = convertGPSToCanvas(myShipGPS.value);

                const myHeading = myShipGPS.value.heading || 0;
                const rad = (((myHeading - 90 - shipHeading.value) % 360) * Math.PI) / 180;

                const resolutionClamp = getMapResolutionClamp();
                const sideLength = 20 / resolutionClamp;
                const baseLength = 15 / resolutionClamp;

                const apexX = myX + sideLength * Math.cos(rad);
                const apexY = myY + sideLength * Math.sin(rad);

                const leftBaseX = myX + (baseLength / 2) * Math.cos(rad + Math.PI / 2);
                const leftBaseY = myY + (baseLength / 2) * Math.sin(rad + Math.PI / 2);
                const rightBaseX = myX - (baseLength / 2) * Math.cos(rad + Math.PI / 2);
                const rightBaseY = myY - (baseLength / 2) * Math.sin(rad + Math.PI / 2);

                const centroidX = (apexX + leftBaseX + rightBaseX) / 3;
                const centroidY = (apexY + leftBaseY + rightBaseY) / 3;

                const offX = myX - centroidX;
                const offY = myY - centroidY;

                const aX = apexX + offX;
                const aY = apexY + offY;
                const lX = leftBaseX + offX;
                const lY = leftBaseY + offY;
                const rX = rightBaseX + offX;
                const rY = rightBaseY + offY;

                canvasCtx.value.beginPath();
                canvasCtx.value.moveTo(aX, aY);
                canvasCtx.value.lineTo(lX, lY);
                canvasCtx.value.lineTo(rX, rY);
                canvasCtx.value.closePath();

                canvasCtx.value.strokeStyle = "#00ff00";
                canvasCtx.value.fillStyle = "#00ff00";
                canvasCtx.value.lineWidth = 3;
                canvasCtx.value.fill();
                canvasCtx.value.stroke();
            }
        };

        /**
         * GPS -> Canvas
         * 1) OpenLayers map이면: getPixelFromCoordinate + viewportSize_ 보정
         * 2) 카카오 adapter map이면: getPixelFromLonLat 결과를 그대로 사용(캔버스 좌표와 동일 전제)
         * 3) map이 없으면: mapCenterGPS 기반 단순 환산
         */
        const convertGPSToCanvas = (gps) => {
            // 1) 카카오 adapter 우선
            if (props.map && typeof props.map.getPixelFromLonLat === "function") {
                const res = props.map.getPixelFromLonLat(gps.lon, gps.lat);
                if (res && res.length === 2) {
                    return { x: res[0], y: res[1] };
                }
            }

            // 2) OpenLayers
            if (
                props.map &&
                typeof props.map.getPixelFromCoordinate === "function"
            ) {
                try {
                    // OpenLayers 좌표 변환(ol/proj 없이 유지하려면 map 내부에서 처리해야 함)
                    // 여기서는 기존 프로젝트가 OpenLayers를 유지하는 경우만 안전하게 동작하도록,
                    // coord를 직접 만들 수 없으니 기존 경로가 필요하면 ol/proj를 다시 붙여야 합니다.
                    // 하지만 현재는 "카카오 전환" 목적이므로, OpenLayers 경로는 실사용하지 않는 전제입니다.
                    // (필요 시 ol/proj를 다시 import해서 fromLonLat([lon,lat])를 넣으세요.)
                } catch (_) {
  // OpenLayers fallback 경로에서 발생 가능한 예외는 무시
}
            }

            // 3) map이 없을 때: 중심GPS 기준 단순 환산
            const mapCenter = store.getters.getMapCenterGPS || centerGPS.value;

            const earthRadiusMeters = 6378000;
            const meterPerLat = (2 * Math.PI * earthRadiusMeters) / 360;
            const meterPerLon = meterPerLat * Math.cos((mapCenter.lat * Math.PI) / 180);

            const deltaLat = Number(gps.lat) - mapCenter.lat;
            const deltaLon = Number(gps.lon) - mapCenter.lon;

            const pixelPerMeter = props.measure;

            const deltaX = deltaLon * meterPerLon * pixelPerMeter;
            const deltaY = -deltaLat * meterPerLat * pixelPerMeter;

            const headingRadians = (-shipHeading.value * Math.PI) / 180;
            const rotatedX = deltaX * Math.cos(headingRadians) - deltaY * Math.sin(headingRadians);
            const rotatedY = deltaX * Math.sin(headingRadians) + deltaY * Math.cos(headingRadians);

            return {
                x: aisCanvas.value.width / 2 + rotatedX,
                y: aisCanvas.value.height / 2 + rotatedY,
            };
        };

        const handleClick = (mouseX, mouseY) => {
            // clientX/clientY로 들어오므로 캔버스 로컬 좌표로 변환
            let clickedX = mouseX;
            let clickedY = mouseY;

            if (aisCanvas.value && typeof aisCanvas.value.getBoundingClientRect === "function") {
                const rect = aisCanvas.value.getBoundingClientRect();
                clickedX = mouseX - rect.left;
                clickedY = mouseY - rect.top;
            }

            const aisData = store.getters.getAISData;
            isShowShipBox.value = false;

            for (const pos of aisData) {
                const { x, y } = convertGPSToCanvas(pos.value[0]);

                const threshold = 10;
                if (Math.abs(clickedX - x) <= threshold && Math.abs(clickedY - y) <= threshold) {
                    const clickedMMSI = pos.value[0].mmsi;
                    const currentSelectedMMSI = store.getters.getSelectedMMSI;

                    if (currentSelectedMMSI === clickedMMSI) {
                        store.commit("setSelectedMMSI", null);
                        store.commit("setAISDateData", []);
                        isShowShipBox.value = false;
                    } else {
                        store.commit("setSelectedMMSI", clickedMMSI);
                        shipBoxPosition.value.x = clickedX;
                        shipBoxPosition.value.y = clickedY;

                        const distanceInMeters = pos.value[0].distance || 0;
                        shipInfo.value = {
                            mmsi: pos.value[0].mmsi,
                            lat: pos.value[0].lat.toFixed(3),
                            lon: pos.value[0].lon.toFixed(3),
                            distance: distanceInMeters.toFixed(0) + " m",
                            sog: formatSpeed(pos.value[0].sog),
                        };
                        emit("selectAIS", pos.value[0]);
                        isShowShipBox.value = true;
                    }

                    drawAISShip();
                    return;
                }
            }
        };

        const shipInfoBoxStyle = computed(() => {
            return `
                top: ${
                    shipBoxPosition.value.y + 200 < centerY.value * 2
                        ? shipBoxPosition.value.y
                        : centerY.value * 2 - 200
                }px;
                left: ${
                    shipBoxPosition.value.x + 200 < centerX.value * 2
                        ? shipBoxPosition.value.x
                        : centerX.value * 2 - 200
                }px;
            `;
        });

        const alertAISError = computed(() => !store.getters.getIsReceive);

        const closeDialog = () => {
            store.commit("setIsReceive", true);
        };

        const findAISMMSI = () => {
            const mmsi = store.getters.getSelectedMMSI;
            const aisData = store.getters.getAISData;

            if (mmsi == null) {
                isShowShipBox.value = false;
                return;
            }

            for (const pos of aisData) {
                if (pos.value[0].mmsi == mmsi) {
                    const { x, y } = convertGPSToCanvas(pos.value[0]);
                    shipBoxPosition.value.x = x + 20;
                    shipBoxPosition.value.y = y + 10;

                    const distanceInMeters = pos.value[0].distance || 0;
                    shipInfo.value = {
                        mmsi: pos.value[0].mmsi,
                        lat: pos.value[0].lat.toFixed(3),
                        lon: pos.value[0].lon.toFixed(3),
                        distance: distanceInMeters.toFixed(0) + " m",
                        sog: formatSpeed(pos.value[0].sog),
                    };
                    emit("selectAIS", pos.value[0]);
                    isShowShipBox.value = true;
                    return;
                }
            }
        };

        const getAISDateData = computed(() => store.getters.getAISDateData);

        watch(
            () => [props.clickedX, props.clickedY],
            ([x, y]) => {
                handleClick(x, y);
            }
        );

        watch(
            () => store.getters.getMapCenterGPS,
            (gps) => {
                if (gps && gps.lat && gps.lon) {
                    centerGPS.value = { ...gps };
                    requestDraw();
                }
            }
        );

        watch(
            () => store.getters.getBuildingGPS,
            (gps) => {
                if (gps && gps.lat && gps.lon) {
                    myShipGPS.value = { ...gps };
                    requestDraw();
                }
            }
        );

        watch(
            () => [props.map, getAISDateData.value],
            () => {
                requestDraw();
            }
        );

        // 줌/드로어 애니메이션 중 캔버스 즉시 클리어, 완료 후 재렌더
        watch(
            () => props.isHiding,
            (hiding) => {
                if (hiding) {
                    if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; drawPending = false; }
                    canvasCtx.value?.clearRect(0, 0, aisCanvas.value?.width || 0, aisCanvas.value?.height || 0);
                } else {
                    requestDraw();
                }
            }
        );

        // 항적 토글 즉시 재렌더
        watch(() => props.showTrack, () => { requestDraw(); });

        watch(
            () => [props.width, props.height],
            () => {
                centerX.value = props.width / 2;
                centerY.value = props.height / 2;
                if (aisCanvas.value) {
                    aisCanvas.value.width = props.width;
                    aisCanvas.value.height = props.height;
                    canvasCtx.value = aisCanvas.value.getContext("2d");
                }
                requestDraw();
            }
        );

        onMounted(() => {
            centerX.value = props.width / 2;
            centerY.value = props.height / 2;

            aisCanvas.value.width = props.width;
            aisCanvas.value.height = props.height;

            const buildingGPS = store.getters.getBuildingGPS;
            const initialGPS =
                buildingGPS ||
                store.getters.getMapCenterGPS ||
                { lat: 35.1358, lon: 129.07 };

            centerGPS.value = { ...initialGPS };

            myShipGPS.value = buildingGPS || { lat: 35.1358, lon: 129.07, heading: 0 };

            canvasCtx.value = aisCanvas.value.getContext("2d");

            drawAISShip();
            drawAISHistory();
            drawTargetAISHistory();

            store.dispatch("connectAISSocket");

            // 신호가 없어도 시간 기반 상태(2분→빨간색, 4분→소멸)를 갱신하기 위해 30초마다 재렌더
            redrawInterval = setInterval(() => { requestDraw(); }, 30 * 1000);

            unsubscribe = store.subscribe((mutation) => {
                if (mutation.type === "setAISData") {
                    requestDraw();
                } else if (mutation.type === "setSelectedMMSI") {
                    findAISMMSI();
                    requestDraw();
                }
            });
        });

        onBeforeUnmount(() => {
            if (redrawInterval) {
                clearInterval(redrawInterval);
                redrawInterval = null;
            }
            if (rafHandle) {
                cancelAnimationFrame(rafHandle);
                rafHandle = 0;
            }
            drawPending = false;

            if (canvasCtx.value && aisCanvas.value) {
                canvasCtx.value.clearRect(0, 0, aisCanvas.value.width, aisCanvas.value.height);
            }
            canvasCtx.value = null;

            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }

            store.dispatch("disconnectAISSocket");
        });

        return {
            aisCanvas,
            drawAISShip,
            handleClick,
            shipInfoBoxStyle,
            isShowShipBox,
            shipInfo,
            alertAISError,
            closeDialog,
            drawPoints,
            findAISMMSI,
        };
    },
};
</script>
