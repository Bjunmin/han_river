import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import vuetify from './plugins/vuetify'
import { loadFonts } from './plugins/webfontloader'
import { fas } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";

import { emitter } from "./emitter";

import { library } from "@fortawesome/fontawesome-svg-core";
library.add(fas);
loadFonts()

const app = createApp(App)
  .component("font-awesome-icon", FontAwesomeIcon)


  
app.config.globalProperties.$emitter = emitter;

app.use(router)
.use(store)
.use(vuetify)
.mount('#app')