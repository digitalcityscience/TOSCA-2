/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    ui({
      ui: {
        button: {
          slots: {
            base: "cursor-pointer",
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@components": resolve(__dirname, "./src/components"),
      "@store": resolve(__dirname, "./src/store"),
      "@helpers": resolve(__dirname, "./src/core/helpers"),
      "@presets": resolve(__dirname, "./src/presets"),
    },
  },
  test: {
    /* for example, use global to avoid globals imports (describe, test, expect): */
    globals: true,
    environment: "jsdom",
  },
});
