/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import { NuxtIconBundle } from "@nuxt/icon/vite";
import vueI18n from "@intlify/unplugin-vue-i18n/vite";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_BACKEND_ROOT_URL?.trim().replace(/\/+$/, "");
  const backendProxy: ProxyOptions | undefined =
    proxyTarget && /^https?:\/\//i.test(proxyTarget)
      ? {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
          // The app authenticates with bearer tokens. Browsers send every
          // cookie set for "localhost" (any port, e.g. a local WordPress) to
          // this dev server; don't forward them to the backend.
          configure: (proxy) => {
            proxy.on("proxyReq", (request) => request.removeHeader("cookie"));
          },
        }
      : undefined;

  return {
    plugins: [
      vue(),
      NuxtIconBundle({
        scan: {
          globInclude: [
            "src/**/*.{vue,js,ts,jsx,tsx}",
            "node_modules/@nuxt/ui/dist/**/*.{vue,js,mjs,ts,jsx,tsx}",
          ],
          globExclude: [],
        },
      }),
      ui({
        ui: {
          button: {
            slots: {
              base: "cursor-pointer justify-center",
            },
          },
          select: {
            slots: {
              content: "z-[80]",
            },
          },
          selectMenu: {
            slots: {
              content: "z-[80]",
            },
          },
        },
      }),
      vueI18n({
        include: resolve(__dirname, "./src/locales/**"),
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          // Finishes popup and silent Keycloak sign-in (see src/auth/callback.ts).
          authCallback: resolve(__dirname, "auth-callback.html"),
        },
      },
    },
    optimizeDeps: {
      // Imported only by the OGC feature-loader worker; pre-bundle them so the
      // dev server does not discover them mid-session and reload the page.
      include: ["@loaders.gl/gis", "@deck.gl/layers"],
    },
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
