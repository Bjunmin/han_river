const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
    transpileDependencies: true,
    publicPath: './',  // ✅ 이거 추가가 핵심!!

    devServer: {
          // webSocketServer: true,//사용하지 않게 변경
      },

    pluginOptions: {
      vuetify: {
			// https://github.com/vuetifyjs/vuetify-loader/tree/next/packages/vuetify-loader
		}
    }
})
