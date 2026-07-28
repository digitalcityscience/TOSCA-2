/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import vueI18n from "@intlify/unplugin-vue-i18n/vite";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_BACKEND_ROOT_URL?.trim().replace(/\/+$/, "");
  const backendProxy =
    proxyTarget && /^https?:\/\//i.test(proxyTarget)
      ? {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        }
      : undefined;

  return {
    plugins: [
      vue(),
      ui({
        ui: {
          button: {
            slots: {
              base: "cursor-pointer justify-center",
            },
          },
        },
      }),
      vueI18n({
        include: resolve(__dirname, "./src/locales/**"),
      }),
    ],
    resolve: {
      alias: {
        "@components": resolve(__dirname, "./src/components"),
        "@store": resolve(__dirname, "./src/store"),
        "@helpers": resolve(__dirname, "./src/core/helpers"),
        "@presets": resolve(__dirname, "./src/presets"),
        "@locales": resolve(__dirname, "./src/locales"),
      },
    },
    server:
      backendProxy === undefined
        ? undefined
        : {
            proxy: {
              "/api": backendProxy,
              "/media": backendProxy,
            },
          },
    test: {
      /* for example, use global to avoid globals imports (describe, test, expect): */
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
