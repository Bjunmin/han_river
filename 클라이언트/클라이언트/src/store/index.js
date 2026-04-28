import { createStore } from "vuex";
import { AIS } from "./modules/AIS"
import { Setting } from "./modules/Setting"

export default createStore({
    modules: {
        AIS,
        Setting
    },
    state: {},
    getters: {},
    actions: {},
    mutations: {},
});
