import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@components": resolve(__dirname, "./src/components"),
      "@store":resolve(__dirname,"./src/store"),
      "@helpers":resolve(__dirname,"./src/core/helpers"),
      "@presets":resolve(__dirname, "./src/presets")
    }
  },
})
