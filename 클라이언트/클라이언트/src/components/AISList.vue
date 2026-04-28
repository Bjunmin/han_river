<template>
    <div style="height: 100%">
        <div
            style="
                display: flex;
                justify-content: space-between;
                margin-bottom: 10px;
            "
        >
            <input
                id="inputAISID"
                v-model="inputAIS"
                style="height: 40px; width: 65%; background: white"
            />
            <button style="height: 40px; width: 33%">검색</button>
        </div>

        <div class="align-space-between" style="margin-bottom: 10px">
            <p>필터</p>
            <div style="display: flex; gap: 8px">
                <!-- 가드존 버튼 -->
                <button
                    style="width: auto !important"
                    @click="clickFilter(0)"
                    class="btn-control"
                    :class="{ selected: filter == 0 }"
                >
                    실시간
                </button>

                <!-- 탐지구역 버튼 -->
                <button
                    style="width: auto !important"
                    @click="clickFilter(1)"
                    class="btn-control"
                    :class="{ selected: filter == 1 }"
                >
                    전체
                </button>
            </div>
        </div>

        <div
            v-if="filter === 0"
            class="aisList"
            style="
                width: 100%;
                height: calc(100% - 220px);
                background-color: #000000;
                color: white;
                overflow-y: scroll;
            "
        >
            <!-- AIS 목록 -->
            <div
                v-for="ais in aisData"
                :key="ais.value[0].mmsi"
                style="display: flex; margin-top: 20px"
                :class="{ selected: selectedMMSI == ais.value[0].mmsi }"
            >
                <!-- 체크박스 -->
                <!-- <input
                    type="checkbox"
                    v-model="ais.selected"
                    style="width: 20px; margin: 5px"
                    @change="handleCheckboxChange(ais)"
                /> -->

                <!-- 테이블 -->
                <table
                    class="infoTable"
                    style="
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    "
                >
                    <tbody @click="clickAISBox(ais.value[0].mmsi)">
                        <tr>
                            <th>MMSI</th>
                            <td>{{ ais.value[0].mmsi }}</td>
                        </tr>
                        <tr>
                            <th>위치</th>
                            <td>
                                N{{ ais.value[0].lat.toFixed(3) }} W{{
                                    ais.value[0].lon.toFixed(3)
                                }}
                            </td>
                        </tr>
                        <tr>
                            <th>거리</th>
                            <td>{{ (ais.value[0].distance || 0).toFixed(0) }} m</td>
                        </tr>
                        <tr>
                            <th>속도</th>
                            <td>{{ ais.value[0].sog }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div
            v-if="filter === 1"
            class="aisData aisList"
            style="
                width: 100%;
                height: calc(100% - 220px);
                background-color: #000000;
                color: white;
                overflow-y: scroll;
            "
        >
            <!-- AIS 목록 -->
            <div
                v-for="ais in allAISData"
                :key="ais.mmsi"
                style="display: flex; margin-top: 20px"
                :class="{ selected: selectedMMSI == ais.mmsi }"
            >
                <table
                    class="infoTable"
                    style="
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    "
                >
                    <tbody @click="clickAISBox(ais.mmsi)">
                        <tr>
                            <th style="width: 40%">MMSI</th>
                            <td style="width: 60%">{{ ais.mmsi }}</td>
                        </tr>
                        <tr>
                            <th>이름</th>
                            <td>{{ ais.name }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div
            style="
                width: 100%;
                height: 110px;
                background-color: #000000;
                color: white;
            "
        >
            <table
                class="infoTable"
                style="width: 100%; border-collapse: collapse; font-size: 12px"
            >
                <tr>
                    <td>시작일</td>
                    <td>
                        <input
                            type="date"
                            class="input-date"
                            v-model="startDate"
                        />
                    </td>
                </tr>
                <tr>
                    <td>종료일</td>
                    <td>
                        <input
                            type="date"
                            class="input-date"
                            v-model="endDate"
                        />
                    </td>
                </tr>
                <tr>
                    <td colspan="2">
                        <button @click="getAISDateData(selectedMMSI)">
                            조회
                        </button>
                    </td>
                </tr>
            </table>
        </div>
    </div>
</template>

<script>
import { ref, computed } from "vue";
import { useStore } from "vuex";

export default {
    name: "AISList",
    setup() {
        const store = useStore();
        const selectedMMSI = ref(null);
        const inputAIS = ref(null);
        const startDate = ref(null);
        const endDate = ref(null);
        const filter = ref(0);

        const aisData = computed(() => {
            const now = Date.now(); // 현재 시간 추가
            return store.getters.getAISData.filter((ais) => {
                // 4분 이상 지난 AIS는 목록에서 제외
                const currentPoint = ais.value[0];
                if (currentPoint && currentPoint.timestamp) {
                    const timeDiff = now - currentPoint.timestamp;
                    if (timeDiff > 4 * 60 * 1000) {
                        return false; // 4분 이상 지난 것은 스킵
                    }
                }

                if (inputAIS.value == null) {
                    return true;
                }
                return (
                    String(ais.value[0].mmsi).includes(inputAIS.value) ||
                    String(ais.value[0].name).includes(inputAIS.value)
                );
            });
        });

        const searchAIS = () => {};

        const clickAISBox = (mmsi) => {
            if (selectedMMSI.value != mmsi) {
                selectedMMSI.value = mmsi;
                store.commit("setSelectedMMSI", mmsi);
            } else {
                selectedMMSI.value = null;
                store.commit("setSelectedMMSI", null);
            }
        };

        const getAISDateData = (mmsi) => {
            // 날짜만 선택하므로 하루의 시작(00:00:00)과 끝(23:59:59)으로 설정
            const startDateObj = new Date(startDate.value);
            startDateObj.setHours(0, 0, 0, 0); // 시작일 00:00:00
            
            const endDateObj = new Date(endDate.value);
            endDateObj.setHours(23, 59, 59, 999); // 종료일 23:59:59

            store.dispatch("getAISDataBetweenDate", {
                mmsi: mmsi,
                startDate: startDateObj.toISOString(),
                endDate: endDateObj.toISOString(),
            });
        };

        const allAISData = computed(() => {
            return store.getters.getAllAISData.filter((ais) => {
                if (inputAIS.value == null) return true;

                return (
                    String(ais.mmsi).includes(inputAIS.value) ||
                    String(ais.name).includes(inputAIS.value)
                );
            });
        });

        const clickFilter = (f) => {
            filter.value = f;
            if (f == 1) {
                store.dispatch("getAllAISData");
            }
        };

        return {
            aisData,
            selectedMMSI,
            searchAIS,
            inputAIS,
            clickAISBox,
            startDate,
            endDate,
            getAISDateData,
            clickFilter,
            filter,
            allAISData,
        };
    },
};
</script>

<style scoped>
button {
    color: white;
    background-color: #717171;
    box-shadow: 0 0px 3px rgba(0, 0, 0, 0.12), 0 0px 3px rgba(0, 0, 0, 0.24);
    border: 0.2px solid #00000080;
    cursor: pointer;
    padding: 5px 20px;
    width: calc(100% - 10px);
    height: 40px;
    border-radius: 5px;
}

.selected {
    border: 1px solid white;
}

.btn-control {
    padding: 4px 16px;
    height: 32px;
    font-size: 12px;
}

input {
    background: white;
    color: black;
}

/* Add specific styles here */
</style>