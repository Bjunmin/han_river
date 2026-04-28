// import store from "@/store";
import axios from "axios";

const service = axios.create({
    // OPTIONS : 'http://172.30.1.60:3000'
});

service.interceptors.request.use(
    async function (config) {
        //요청을 보내기 전에 수행할 일
        // config.headers["Content-Type"] = "application/json; charset=utf-8";
        // // var accessToken = store.getters.getAccessToken;
        // // var refreshToken = store.getters.getRefreshToken;
        // var accessToken = sessionStorage.getItem("accessToken");
        // var refreshToken = sessionStorage.getItem("refreshToken");
        // if (accessToken != null) {
        //     config.headers["Authorization"] = "Bearer " + accessToken;
        // } else if (refreshToken != null) {
        //     config.headers["Authorization"] = "Bearer " + refreshToken;
        // } else {
        //     config.headers["Authorization"] = null;
        // }

        config.timeout = 10000;
        return config;
    },
    function (error) {
        // 오류 요청을 보내기전 수행할 일
        // ...
        return Promise.reject(error);
    }
);

// 응답 인터셉터 추가
service.interceptors.response.use(
    function (response) {
        // 응답 데이터를 가공
        // ...
        return response;
    },
    async function (error) {
        // const errorRes = error.response;
        // const errorConfig = error.config;

        // console.log("error Interceptors: ", error);
        // console.log(errorRes.status === 401 && !errorConfig.isRefreshToken);

        // if (errorRes.config.url.includes("auth/token/access")) {
        //     return Promise.reject(error);
        // }
        // if (errorRes.status === 401 && !errorConfig.isRefreshToken) {
        //     errorConfig.isRefreshToken = true;
        //     store.commit("setAccessToken", null);
        //     try {
        //         const newAccessToken = await store.dispatch(
        //             "refreshAccessToken"
        //         );
        //         errorConfig.headers[
        //             "Authorization"
        //         ] = `Bearer ${newAccessToken}`;

        //         console.log(errorConfig);
        //         return axios(errorConfig);
        //     } catch (refreshError) {
        //         console.log("error:", refreshError);
        //         // store.dispatch("logout");
        //         return Promise.reject(refreshError);
        //     }
        // }

        // if (cookies.get("refreshToken") === null) {
        //     store.commit("setIsAuthenticated", false);
        //     return Promise.reject(error);
        // } else {
        //     if (errorRes.status === 419) {
        //         // accessToken이 null일 경우 419코드를 받고 토큰 재생성 요청
        //         try {
        //             cookies.set("accessToken", null);
        //             await store.dispatch("checkRefreshToken");
        //             return axios(errorAPI);
        //         } catch (err) {
        //             console.error(err);
        //             return Promise.reject(err);
        //         }
        //     }
        //     if (errorRes.status === 401) {
        //         //accessToken이 변조 등 유효하지 않은 토큰일 경우
        //         console.warn("유효하지 않은 토큰", error);
        //         store.commit("setIsAuthenticated", false);
        //         if (store.getters.getAccessToken != null) {
        //             alert("다시 로그인해주시기 바랍니다.");
        //         }
        //         store.commit("setRefreshToken", null);
        //         store.commit("setAccessToken", null);
        //         cookies.set("accessToken", null);
        //         cookies.set("refreshToken", null);
        //         return Promise.reject(error);
        //     }
        // }
        return Promise.reject(error);
    }
);

// 각 메소드별 함수를 생성해 주세요.
export default {
    get(options, param) {
        return service.get(options, { params: param });
    },

    post(options, param) {
        return service.post(options, param);
    },

    patch(options, param) {
        return service.patch(options, param);
    },

    delete(options) {
        return service.delete(options);
    },

    async download(options, filename) {
        await axios({
            url: options,
            method: "GET",
            responseType: "blob",
        }).then((res) => {
            const blob = new Blob([res.data]);

            const fileObjectUrl = window.URL.createObjectURL(blob);
            let link = document.createElement("a");
            link.style.display = "none";
            link.href = fileObjectUrl;
            link.setAttribute("download", filename);

            // 다운로드 파일 이름을 지정 할 수 있습니다.
            // 일반적으로 서버에서 전달해준 파일 이름은 응답 Header의 Content-Disposition에 설정됩니다.
            // link.download = extractDownloadFilename(res);

            // // 다운로드 파일 이름을 추출하는 함수
            // const extractDownloadFilename = (response) => {
            //     const disposition = response.headers["content-disposition"];
            //     const fileName = decodeURI(
            //     disposition
            //         .match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)[1]
            //         .replace(/['"]/g, "")
            //     );
            //     return fileName;
            // };

            // // 다운로드 파일의 이름은 직접 지정 할 수 있습니다.
            // // link.download = "sample-file.xlsx";

            // 링크를 body에 추가하고 강제로 click 이벤트를 발생시켜 파일 다운로드를 실행시킵니다.
            document.body.appendChild(link);
            link.click();
            link.remove();

            // 다운로드가 끝난 리소스(객체 URL)를 해제합니다.
            window.URL.revokeObjectURL(fileObjectUrl);
        });
    },

    async put() {
        // 공통
    },
};
