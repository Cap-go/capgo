// vite.config.mts
import path from "node:path";
import AutoImport from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/unplugin-auto-import/dist/vite.js";
import VueMacros from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/unplugin-vue-macros/dist/vite.mjs";
import VueI18n from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/@intlify/unplugin-vue-i18n/lib/vite.mjs";
import VueDevTools from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/vite-plugin-vue-devtools/dist/vite.mjs";
import WebfontDownload from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/vite-plugin-webfont-dl/dist/index.mjs";
import { VueRouterAutoImports } from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/unplugin-vue-router/dist/index.mjs";
import { readdirSync } from "node:fs";
import Vue from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { defineConfig } from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/vite/dist/node/index.js";
import VueRouter from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/unplugin-vue-router/dist/vite.mjs";
import Layouts from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/vite-plugin-vue-layouts/dist/index.mjs";
import Icons from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/unplugin-icons/dist/vite.js";
import IconsResolver from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/unplugin-icons/dist/resolver.js";
import Components from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/unplugin-vue-components/dist/vite.js";
import { VitePWA } from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/vite-plugin-pwa/dist/index.js";
import EnvironmentPlugin from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/vite-plugin-environment/dist/index.js";
import { ElementPlusResolver } from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/unplugin-vue-components/dist/resolvers.js";

// scripts/utils.mjs
import { config } from "file:///Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app/node_modules/dotenv/lib/main.js";

// configs.json
var configs_default = {
  base_domain: {
    prod: "web.capgo.app",
    development: "development.capgo.app",
    local: "localhost:3332"
  },
  supa_anon: {
    prod: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2d3pwb2F6bXhrcW9zcmRld3l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgwNzAyNzUsImV4cCI6MjAyMzY0NjI3NX0.snaF6idn1toeFB4oN7Gax1e0OfiPjDO28ep91SYbkKA",
    development: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1Y3N5YnZuaGF2b2dkbXp3dGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NTQ1Mzk1MDYsImV4cCI6MTk3MDExNTUwNn0.HyuZmo_EjF5fgZQU3g37bdNardK1CLHgxXmYqtr59bo",
    local: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
  },
  supa_url: {
    prod: "https://xvwzpoazmxkqosrdewyv.supabase.co",
    development: "https://aucsybvnhavogdmzwtcw.supabase.co",
    local: "http://localhost:54321"
  },
  api_domain: {
    prod: "api.capgo.app",
    development: "api-dev.capgo.app",
    local: "localhost:54321/functions/v1"
  }
};

// scripts/utils.mjs
config();
var branch = process.env.ENV || process.env.BRANCH || "main";
console.log("Branch", branch);
function getRightKey(keyname) {
  if (!configs_default || !configs_default[keyname])
    return "";
  if (branch === "development")
    return configs_default[keyname].development;
  else if (branch === "local")
    return configs_default[keyname].local;
  return configs_default[keyname].prod;
}
var supa_url = getRightKey("supa_url");
var supa_anon = getRightKey("supa_anon");

// package.json
var package_default = {
  name: "capgo-app",
  type: "module",
  version: "10.467.0",
  private: true,
  scripts: {
    build: "vite build",
    test: "playwright test",
    preview: "vite preview",
    "preview-https": "serve dist",
    mobile: "vite build --mode mobile && cap copy",
    "capacitor-assets": "bunx @capacitor/assets generate --assetPath assets --iconBackgroundColor '#111827' --iconBackgroundColorDark '#111827' --splashBackgroundColor '#111827' --splashBackgroundColorDark '#111827' --logoSplashScale 0.3",
    resources: "cordova-res --skip-config --copy --icon-background-source '#ffffff'",
    sync: "cap sync",
    "sync:ios": "cap sync ios",
    "sync:android": "cap sync android",
    serve: "vite",
    "prebuild-serve-dev": "ENV=local vite build --sourcemap true --minify false --assetsDir . && http-server ./dist -p 5173",
    "serve-dev": "ENV=local vite",
    backend: "supabase start && supabase functions serve",
    reset: "supabase db reset",
    "dev-back": "wrangler dev cloudflare_workers/index.ts",
    dev: "bunx netlify dev --port 8881",
    "test:backend": "deno run --allow-all tests_backend/run_backend_tests.ts backend",
    "test:cli": "deno run --allow-all tests_backend/run_backend_tests.ts cli",
    "test:selectable_disallow": "deno run --allow-all tests_backend/run_backend_tests.ts selectable_disallow",
    "test:all": "deno run --allow-all tests_backend/run_backend_tests.ts all",
    "test:zod": "deno test --allow-all tests_backend/zod.test.ts",
    "test:organization": "deno run --allow-all tests_backend/run_backend_tests.ts organization",
    "dev-mobile": "BRANCH=development vite build --mode mobile && cap copy",
    "dev-build": "BRANCH=development vite build",
    "dev-serve": "BRANCH=development vite",
    "dev-ios": "cap sync && cap run ios",
    "local-serve": "BRANCH=local vite",
    lint: 'eslint "src/**/*.{vue,ts,js}"',
    "lint-backend": 'eslint "supabase/**/*.{vue,ts,js}"',
    "deploy:cf_serverless": "wrangler deploy",
    types: "bun ./scripts/getTypes.mjs",
    "dev-types": "BRANCH=development bun ./scripts/getTypes.mjs",
    typecheck: "vue-tsc --noEmit",
    "ionic:build": "vite build",
    "ionic:serve": "vite",
    "d1:clear": "rm -rf .wrangler",
    "d1:seed": 'bunx wrangler d1 execute --local --command "$(cat ./supabase/d1.sql)" capgo',
    "d1:local-srv": "bunx wrangler dev ./cloudflare_workers/d1.js --ip 0.0.0.0 --port 6655",
    "d1:local-clone": "SUPABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' D1_URL='http://localhost:6655' deno run --allow-all supabase/functions/script/duplicate_in_d1.ts",
    "d1:reset": "bun d1:clear && bun d1:seed",
    "d1:generate-migration": "deno run --allow-all supabase/functions/script/generate_d1_replication_sql_migration.ts",
    "cf-edge:run": "bunx wrangler dev --port 7777",
    "cf-backend_deploy": "bunx wrangler deploy",
    "cf-backend_deploy_env": "node scripts/deploy_cf_backend_env.mjs .env capgo_api",
    "cf-backend_deploy_env:alpha": "node scripts/deploy_cf_backend_env.mjs .env.alpha capgo_api-alpha",
    "cf-backend_deploy_env:preprod": "node scripts/deploy_cf_backend_env.mjs .env capgo_api-preprod",
    size: "bunx vite-bundle-visualizer",
    "minio:start": "cd ./tests_backend/gh_actions && sh ./minio.sh && cd ../..",
    "minio:seed": "cd ./tests_backend/gh_actions && sh ./minio-seed.sh && cd ../..",
    "minio:delete": "docker stop minio1 && docker rm minio1 && rm -rf /tmp/minio-data",
    "clickhouse:start": "cd ./tests_backend/gh_actions && sh ./clickhouse.sh && cd ../..",
    "clickhouse:seed": "cd ./tests_backend/gh_actions && sh ./clickhouse-seed.sh && cd ../..",
    "clickhouse:delete": "docker stop some-clickhouse-server && docker rm some-clickhouse-server && rm -rf /tmp/ch_*",
    "clickhouse:add-local": "deno run --allow-all supabase/functions/_script/add_clickhouse_to_supabase.ts"
  },
  dependencies: {
    "@capacitor-community/keep-awake": "^4.0.0",
    "@capacitor/action-sheet": "^5.0.7",
    "@capacitor/android": "^5.7.0",
    "@capacitor/app": "^5.0.7",
    "@capacitor/app-launcher": "^5.0.7",
    "@capacitor/assets": "3.0.4",
    "@capacitor/browser": "^5.2.0",
    "@capacitor/camera": "^5.0.9",
    "@capacitor/clipboard": "^5.0.7",
    "@capacitor/device": "^5.0.7",
    "@capacitor/dialog": "^5.0.7",
    "@capacitor/filesystem": "^5.2.1",
    "@capacitor/geolocation": "^5.0.7",
    "@capacitor/haptics": "^5.0.7",
    "@capacitor/ios": "^5.7.0",
    "@capacitor/keyboard": "^5.0.8",
    "@capacitor/local-notifications": "^5.0.7",
    "@capacitor/motion": "^5.0.7",
    "@capacitor/network": "^5.0.7",
    "@capacitor/preferences": "^5.0.7",
    "@capacitor/push-notifications": "^5.1.1",
    "@capacitor/screen-reader": "^5.0.7",
    "@capacitor/share": "^5.0.7",
    "@capacitor/splash-screen": "^5.0.7",
    "@capacitor/status-bar": "^5.0.7",
    "@capacitor/text-zoom": "^5.0.7",
    "@capacitor/toast": "^5.0.7",
    "@capawesome/capacitor-file-picker": "^5.3.0",
    "@capawesome/capacitor-screen-orientation": "^5.0.1",
    "@capgo/capacitor-crisp": "^2.0.16",
    "@capgo/capacitor-flash": "^2.0.14",
    "@capgo/capacitor-mute": "^2.0.13",
    "@capgo/capacitor-native-biometric": "^5.1.0",
    "@capgo/capacitor-screen-recorder": "^5.0.0",
    "@capgo/capacitor-updater": "5.6.2",
    "@capgo/google-play-scraper": "^9.1.2",
    "@capgo/inappbrowser": "^1.3.3",
    "@capgo/native-audio": "^6.1.36",
    "@capgo/native-market": "^5.0.5",
    "@capgo/s3-lite-client": "0.1.8",
    "@formkit/auto-animate": "1.0.0-pre-alpha.3",
    "@formkit/themes": "1.5.9",
    "@formkit/vue": "1.5.9",
    "@intlify/unplugin-vue-i18n": "^2.0.0",
    "@logsnag/node": "1.0.1",
    "@netlify/functions": "^2.6.0",
    "@revenuecat/purchases-capacitor": "^7.5.2",
    "@supabase/supabase-js": "2.39.6",
    "@tailwindcss/forms": "^0.5.7",
    "@vueuse/components": "^10.7.2",
    "@vueuse/core": "10.7.2",
    "@zip.js/zip.js": "2.7.34",
    "adm-zip": "^0.5.10",
    atropos: "^1.0.2",
    "base64-arraybuffer": "1.0.2",
    "bun-types": "^1.0.26",
    "capacitor-rate-app": "4.0.3",
    "capacitor-secure-storage-plugin": "^0.9.0",
    "chart.js": "^4.4.1",
    "chartjs-adapter-dayjs": "^1.0.0",
    "chartjs-plugin-annotation": "^3.0.1",
    "copy-text-to-clipboard": "^3.2.0",
    "country-code-to-flag-emoji": "^1.3.2",
    "cron-schedule": "^4.0.0",
    "crypto-random-string": "^5.0.0",
    daisyui: "^4.7.2",
    dayjs: "1.11.10",
    dompurify: "^3.0.8",
    "drizzle-orm": "^0.29.3",
    firebase: "10.8.0",
    flowbite: "^2.3.0",
    "generate-password-browser": "^1.1.0",
    "google-play-scraper": "^9.2.0",
    hono: "4.0.5",
    json2csv: "^5.0.7",
    konsta: "^3.1.2",
    ky: "^1.2.0",
    lauqe: "^1.5.0",
    "lodash.debounce": "^4.0.8",
    logsnag: "^1.0.0",
    mime: "4.0.1",
    nprogress: "1.0.0-1",
    pinia: "2.1.7",
    "plausible-tracker": "^0.3.8",
    postgres: "^3.4.3",
    "prism-theme-vars": "^0.2.4",
    semver: "^7.6.0",
    stripe: "^14.17.0",
    "unplugin-auto-import": "^0.17.5",
    "unplugin-vue-macros": "^2.7.10",
    "unplugin-vue-router": "^0.7.0",
    "vite-plugin-vue-devtools": "^7.0.15",
    "vite-plugin-webfont-dl": "^3.9.1",
    vue: "3.4.19",
    "vue-chartjs": "^5.3.0",
    "vue-demi": "0.14.7",
    "vue-i18n": "9.9.1",
    "vue-router": "4.2.5",
    "vue-sonner": "^1.0.3",
    zod: "^3.22.4"
  },
  devDependencies: {
    "@antfu/eslint-config": "2.6.4",
    "@capacitor/cli": "^5.7.0",
    "@capacitor/core": "^5.7.0",
    "@cloudflare/workers-types": "^4.20240208.0",
    "@iconify-json/carbon": "1.1.30",
    "@iconify-json/heroicons": "^1.1.20",
    "@iconify-json/ion": "1.1.15",
    "@iconify-json/ls": "1.1.8",
    "@iconify/json": "^2.2.183",
    "@playwright/test": "1.41.2",
    "@tailwindcss/aspect-ratio": "^0.4.2",
    "@tailwindcss/container-queries": "^0.1.1",
    "@tailwindcss/typography": "^0.5.10",
    "@types/adm-zip": "^0.5.5",
    "@types/deep-diff": "1.0.5",
    "@types/dompurify": "3.0.5",
    "@types/emoji-flags": "^1.3.3",
    "@types/fs-extra": "^11.0.4",
    "@types/lodash.debounce": "^4.0.9",
    "@types/minio": "^7.1.1",
    "@types/nprogress": "^0.2.3",
    "@types/uuid": "9.0.8",
    "@vitejs/plugin-vue": "5.0.4",
    "@vitejs/plugin-vue-jsx": "^3.1.0",
    "@vue/cli-service": "5.0.8",
    "@vue/compiler-sfc": "3.4.19",
    "@vue/server-renderer": "3.4.19",
    autoprefixer: "^10.4.17",
    critters: "0.0.20",
    "cross-env": "^7.0.3",
    "deep-diff": "1.0.2",
    eslint: "8.56.0",
    "http-server": "^14.1.1",
    "https-localhost": "4.7.1",
    husky: "^9.0.10",
    miniflare: "^3.20240129.3",
    postcss: "^8.4.35",
    sass: "1.71.0",
    tailwindcss: "^3.4.1",
    typescript: "5.3.3",
    "unplugin-icons": "0.18.5",
    "unplugin-vue-components": "^0.26.0",
    vite: "5.1.3",
    "vite-plugin-environment": "1.1.3",
    "vite-plugin-pwa": "0.18.2",
    "vite-plugin-vue-layouts": "0.11.0",
    vitest: "1.3.0",
    "vue-tsc": "1.8.27",
    wrangler: "3.28.3"
  },
  husky: {
    hooks: {
      "pre-commit": "bun run lint"
    }
  }
};

// vite.config.mts
var __vite_injected_original_dirname = "/Users/martindonadieu/Documents/Projects.tmp/capgo/capgo-app";
function getUrl(key = "base_domain") {
  if (branch === "local")
    return `http://${getRightKey(key)}`;
  else
    return `https://${getRightKey(key)}`;
}
var locales = [];
readdirSync("./locales/").forEach((file) => {
  if (file.split(".")[0] !== "README")
    locales.push(file.split(".")[0]);
});
var vite_config_default = defineConfig({
  resolve: {
    alias: {
      "~/": `${path.resolve(__vite_injected_original_dirname, "src")}/`
    }
  },
  plugins: [
    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/]
        })
      }
    }),
    Components({
      extensions: ["vue"],
      // allow auto import and register components used in markdown
      include: [/\.vue$/, /\.vue\?vue/],
      dts: "src/components.d.ts",
      resolvers: [
        IconsResolver(),
        ElementPlusResolver({
          importStyle: "sass"
        })
      ]
    }),
    EnvironmentPlugin({
      locales: locales.join(","),
      VITE_APP_VERSION: package_default.version,
      VITE_SUPABASE_ANON_KEY: getRightKey("supa_anon"),
      VITE_SUPABASE_URL: getRightKey("supa_url"),
      VITE_APP_URL: `${getUrl()}`,
      VITE_API_HOST: `${getUrl("api_domain")}`,
      VITE_BRANCH: branch,
      package_dependencies: JSON.stringify(package_default.dependencies),
      domain: getUrl(),
      pls_domain: "web.capgo.app",
      logsnag: "c124f5e9d0ce5bdd14bbb48f815d5583",
      crisp: "e7dbcfa4-91b1-4b74-b563-b9234aeb2eee"
    }, { defineOn: "import.meta.env" }),
    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      extensions: [".vue", ".md"],
      dts: "src/typed-router.d.ts"
    }),
    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),
    // https://github.com/antfu/unplugin-icons
    Icons({
      autoInstall: true
    }),
    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      imports: [
        "vue",
        "vue-i18n",
        "@vueuse/head",
        "@vueuse/core",
        VueRouterAutoImports,
        {
          // add any other imports you were relying on
          "vue-router/auto": ["useLink"]
        }
      ],
      dts: "src/auto-imports.d.ts",
      dirs: [
        "src/composables",
        "src/stores"
      ],
      vueTemplate: true
    }),
    // https://github.com/antfu/vite-plugin-pwa
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "robots.txt", "safari-pinned-tab.svg"],
      manifest: {
        name: "Capgo",
        short_name: "CapGo",
        theme_color: "#ffffff",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      }
    }),
    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
      include: [path.resolve(__vite_injected_original_dirname, "locales/**")]
    }),
    // https://github.com/feat-agency/vite-plugin-webfont-dl
    WebfontDownload(),
    // https://github.com/webfansplz/vite-plugin-vue-devtools
    VueDevTools()
  ],
  server: {
    fs: {
      strict: true
    }
  },
  optimizeDeps: {
    include: [
      "vue",
      "vue-router",
      "@vueuse/core"
    ],
    exclude: [
      "vue-demi"
    ]
  },
  // https://github.com/vitest-dev/vitest
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    deps: {
      inline: ["@vue", "@vueuse", "vue-demi"]
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubXRzIiwgInNjcmlwdHMvdXRpbHMubWpzIiwgImNvbmZpZ3MuanNvbiIsICJwYWNrYWdlLmpzb24iXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbWFydGluZG9uYWRpZXUvRG9jdW1lbnRzL1Byb2plY3RzLnRtcC9jYXBnby9jYXBnby1hcHBcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9tYXJ0aW5kb25hZGlldS9Eb2N1bWVudHMvUHJvamVjdHMudG1wL2NhcGdvL2NhcGdvLWFwcC92aXRlLmNvbmZpZy5tdHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL21hcnRpbmRvbmFkaWV1L0RvY3VtZW50cy9Qcm9qZWN0cy50bXAvY2FwZ28vY2FwZ28tYXBwL3ZpdGUuY29uZmlnLm10c1wiO2ltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCBBdXRvSW1wb3J0IGZyb20gJ3VucGx1Z2luLWF1dG8taW1wb3J0L3ZpdGUnXG5pbXBvcnQgVnVlTWFjcm9zIGZyb20gJ3VucGx1Z2luLXZ1ZS1tYWNyb3Mvdml0ZSdcbmltcG9ydCBWdWVJMThuIGZyb20gJ0BpbnRsaWZ5L3VucGx1Z2luLXZ1ZS1pMThuL3ZpdGUnXG5pbXBvcnQgVnVlRGV2VG9vbHMgZnJvbSAndml0ZS1wbHVnaW4tdnVlLWRldnRvb2xzJ1xuaW1wb3J0IFdlYmZvbnREb3dubG9hZCBmcm9tICd2aXRlLXBsdWdpbi13ZWJmb250LWRsJ1xuaW1wb3J0IHsgVnVlUm91dGVyQXV0b0ltcG9ydHMgfSBmcm9tICd1bnBsdWdpbi12dWUtcm91dGVyJ1xuaW1wb3J0IHsgcmVhZGRpclN5bmMgfSBmcm9tICdub2RlOmZzJ1xuaW1wb3J0IFZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXG5cbi8vIGltcG9ydCB2ZWF1cnlWaXRlUGx1Z2lucyBmcm9tICd2ZWF1cnkvdml0ZS9pbmRleCdcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgVnVlUm91dGVyIGZyb20gJ3VucGx1Z2luLXZ1ZS1yb3V0ZXIvdml0ZSdcbmltcG9ydCBMYXlvdXRzIGZyb20gJ3ZpdGUtcGx1Z2luLXZ1ZS1sYXlvdXRzJ1xuaW1wb3J0IEljb25zIGZyb20gJ3VucGx1Z2luLWljb25zL3ZpdGUnXG5pbXBvcnQgSWNvbnNSZXNvbHZlciBmcm9tICd1bnBsdWdpbi1pY29ucy9yZXNvbHZlcidcbmltcG9ydCBDb21wb25lbnRzIGZyb20gJ3VucGx1Z2luLXZ1ZS1jb21wb25lbnRzL3ZpdGUnXG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJ1xuaW1wb3J0IEVudmlyb25tZW50UGx1Z2luIGZyb20gJ3ZpdGUtcGx1Z2luLWVudmlyb25tZW50J1xuaW1wb3J0IHsgRWxlbWVudFBsdXNSZXNvbHZlciB9IGZyb20gJ3VucGx1Z2luLXZ1ZS1jb21wb25lbnRzL3Jlc29sdmVycydcbmltcG9ydCB7IGJyYW5jaCwgZ2V0UmlnaHRLZXkgfSBmcm9tICcuL3NjcmlwdHMvdXRpbHMubWpzJ1xuaW1wb3J0IHBhY2sgZnJvbSAnLi9wYWNrYWdlLmpzb24nXG5cbmZ1bmN0aW9uIGdldFVybChrZXkgPSAnYmFzZV9kb21haW4nKTogc3RyaW5nIHtcbiAgaWYgKGJyYW5jaCA9PT0gJ2xvY2FsJylcbiAgICByZXR1cm4gYGh0dHA6Ly8ke2dldFJpZ2h0S2V5KGtleSl9YFxuICBlbHNlXG4gICAgcmV0dXJuIGBodHRwczovLyR7Z2V0UmlnaHRLZXkoa2V5KX1gXG59XG5cbmNvbnN0IGxvY2FsZXM6IHN0cmluZ1tdID0gW11cbnJlYWRkaXJTeW5jKCcuL2xvY2FsZXMvJylcbiAgLmZvckVhY2goKGZpbGUpID0+IHtcbiAgICBpZiAoZmlsZS5zcGxpdCgnLicpWzBdICE9PSAnUkVBRE1FJylcbiAgICAgIGxvY2FsZXMucHVzaChmaWxlLnNwbGl0KCcuJylbMF0pXG4gIH0pXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ34vJzogYCR7cGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ3NyYycpfS9gLFxuICAgIH0sXG4gIH0sXG4gIHBsdWdpbnM6IFsgICAgXG4gIFZ1ZU1hY3Jvcyh7XG4gICAgcGx1Z2luczoge1xuICAgICAgdnVlOiBWdWUoe1xuICAgICAgICBpbmNsdWRlOiBbL1xcLnZ1ZSQvLCAvXFwubWQkL10sXG4gICAgICB9KSxcbiAgXG4gICAgfSxcbiAgfSksXG4gIENvbXBvbmVudHMoe1xuICAgIGV4dGVuc2lvbnM6IFsndnVlJ10sXG4gICAgLy8gYWxsb3cgYXV0byBpbXBvcnQgYW5kIHJlZ2lzdGVyIGNvbXBvbmVudHMgdXNlZCBpbiBtYXJrZG93blxuICAgIGluY2x1ZGU6IFsvXFwudnVlJC8sIC9cXC52dWVcXD92dWUvXSxcbiAgICBkdHM6ICdzcmMvY29tcG9uZW50cy5kLnRzJyxcbiAgICByZXNvbHZlcnM6IFtcbiAgICAgIEljb25zUmVzb2x2ZXIoKSxcbiAgICAgIEVsZW1lbnRQbHVzUmVzb2x2ZXIoe1xuICAgICAgICBpbXBvcnRTdHlsZTogJ3Nhc3MnLFxuICAgICAgfSksXG4gICAgXSxcbiAgfSksXG4gIEVudmlyb25tZW50UGx1Z2luKHtcbiAgICBsb2NhbGVzOiBsb2NhbGVzLmpvaW4oJywnKSxcbiAgICBWSVRFX0FQUF9WRVJTSU9OOiBwYWNrLnZlcnNpb24sXG4gICAgVklURV9TVVBBQkFTRV9BTk9OX0tFWTogZ2V0UmlnaHRLZXkoJ3N1cGFfYW5vbicpLFxuICAgIFZJVEVfU1VQQUJBU0VfVVJMOiBnZXRSaWdodEtleSgnc3VwYV91cmwnKSxcbiAgICBWSVRFX0FQUF9VUkw6IGAke2dldFVybCgpfWAsXG4gICAgVklURV9BUElfSE9TVDogYCR7Z2V0VXJsKCdhcGlfZG9tYWluJyl9YCxcbiAgICBWSVRFX0JSQU5DSDogYnJhbmNoLFxuICAgIHBhY2thZ2VfZGVwZW5kZW5jaWVzOiBKU09OLnN0cmluZ2lmeShwYWNrLmRlcGVuZGVuY2llcyksXG4gICAgZG9tYWluOiBnZXRVcmwoKSxcbiAgICBwbHNfZG9tYWluOiAnd2ViLmNhcGdvLmFwcCcsXG4gICAgbG9nc25hZzogJ2MxMjRmNWU5ZDBjZTViZGQxNGJiYjQ4ZjgxNWQ1NTgzJyxcbiAgICBjcmlzcDogJ2U3ZGJjZmE0LTkxYjEtNGI3NC1iNTYzLWI5MjM0YWViMmVlZScsXG4gIH0sIHsgZGVmaW5lT246ICdpbXBvcnQubWV0YS5lbnYnIH0pLFxuXG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wb3N2YS91bnBsdWdpbi12dWUtcm91dGVyXG4gIFZ1ZVJvdXRlcih7XG4gICAgZXh0ZW5zaW9uczogWycudnVlJywgJy5tZCddLFxuICAgIGR0czogJ3NyYy90eXBlZC1yb3V0ZXIuZC50cycsXG4gIH0pLFxuXG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9Kb2huQ2FtcGlvbkpyL3ZpdGUtcGx1Z2luLXZ1ZS1sYXlvdXRzXG4gIExheW91dHMoKSxcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FudGZ1L3VucGx1Z2luLWljb25zXG4gIEljb25zKHtcbiAgICBhdXRvSW5zdGFsbDogdHJ1ZSxcbiAgfSksXG5cbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FudGZ1L3VucGx1Z2luLWF1dG8taW1wb3J0XG4gIEF1dG9JbXBvcnQoe1xuICAgIGltcG9ydHM6IFtcbiAgICAgICd2dWUnLFxuICAgICAgJ3Z1ZS1pMThuJyxcbiAgICAgICdAdnVldXNlL2hlYWQnLFxuICAgICAgJ0B2dWV1c2UvY29yZScsXG4gICAgICBWdWVSb3V0ZXJBdXRvSW1wb3J0cyxcbiAgICAgIHtcbiAgICAgICAgLy8gYWRkIGFueSBvdGhlciBpbXBvcnRzIHlvdSB3ZXJlIHJlbHlpbmcgb25cbiAgICAgICAgJ3Z1ZS1yb3V0ZXIvYXV0byc6IFsndXNlTGluayddLFxuICAgICAgfSxcbiAgICBdLFxuICAgIGR0czogJ3NyYy9hdXRvLWltcG9ydHMuZC50cycsXG4gICAgZGlyczogW1xuICAgICAgJ3NyYy9jb21wb3NhYmxlcycsXG4gICAgICAnc3JjL3N0b3JlcycsXG4gICAgXSxcbiAgICB2dWVUZW1wbGF0ZTogdHJ1ZSxcbiAgfSksXG5cbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYW50ZnUvdml0ZS1wbHVnaW4tcHdhXG4gICAgVml0ZVBXQSh7XG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcbiAgICAgIGluY2x1ZGVBc3NldHM6IFsnZmF2aWNvbi5zdmcnLCAncm9ib3RzLnR4dCcsICdzYWZhcmktcGlubmVkLXRhYi5zdmcnXSxcbiAgICAgIG1hbmlmZXN0OiB7XG4gICAgICAgIG5hbWU6ICdDYXBnbycsXG4gICAgICAgIHNob3J0X25hbWU6ICdDYXBHbycsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnI2ZmZmZmZicsXG4gICAgICAgIGljb25zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiAnL3B3YS0xOTJ4MTkyLnBuZycsXG4gICAgICAgICAgICBzaXplczogJzE5MngxOTInLFxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzcmM6ICcvcHdhLTUxMng1MTIucG5nJyxcbiAgICAgICAgICAgIHNpemVzOiAnNTEyeDUxMicsXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNyYzogJy9wd2EtNTEyeDUxMi5wbmcnLFxuICAgICAgICAgICAgc2l6ZXM6ICc1MTJ4NTEyJyxcbiAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnLFxuICAgICAgICAgICAgcHVycG9zZTogJ2FueSBtYXNrYWJsZScsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfSksXG5cbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2ludGxpZnkvYnVuZGxlLXRvb2xzL3RyZWUvbWFpbi9wYWNrYWdlcy91bnBsdWdpbi12dWUtaTE4blxuICBWdWVJMThuKHtcbiAgICBydW50aW1lT25seTogdHJ1ZSxcbiAgICBjb21wb3NpdGlvbk9ubHk6IHRydWUsXG4gICAgZnVsbEluc3RhbGw6IHRydWUsXG4gICAgaW5jbHVkZTogW3BhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdsb2NhbGVzLyoqJyldLFxuICB9KSxcblxuICAvLyBodHRwczovL2dpdGh1Yi5jb20vZmVhdC1hZ2VuY3kvdml0ZS1wbHVnaW4td2ViZm9udC1kbFxuICBXZWJmb250RG93bmxvYWQoKSxcblxuICAvLyBodHRwczovL2dpdGh1Yi5jb20vd2ViZmFuc3Bsei92aXRlLXBsdWdpbi12dWUtZGV2dG9vbHNcbiAgVnVlRGV2VG9vbHMoKSxdLFxuXG4gIHNlcnZlcjoge1xuICAgIGZzOiB7XG4gICAgICBzdHJpY3Q6IHRydWUsXG4gICAgfSxcbiAgfSxcblxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBpbmNsdWRlOiBbXG4gICAgICAndnVlJyxcbiAgICAgICd2dWUtcm91dGVyJyxcbiAgICAgICdAdnVldXNlL2NvcmUnLFxuICAgIF0sXG4gICAgZXhjbHVkZTogW1xuICAgICAgJ3Z1ZS1kZW1pJyxcbiAgICBdLFxuICB9LFxuXG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXRlc3QtZGV2L3ZpdGVzdFxuICB0ZXN0OiB7XG4gICAgaW5jbHVkZTogWyd0ZXN0LyoqLyoudGVzdC50cyddLFxuICAgIGVudmlyb25tZW50OiAnanNkb20nLFxuICAgIGRlcHM6IHtcbiAgICAgIGlubGluZTogWydAdnVlJywgJ0B2dWV1c2UnLCAndnVlLWRlbWknXSxcbiAgICB9LFxuICB9LFxufSlcbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL21hcnRpbmRvbmFkaWV1L0RvY3VtZW50cy9Qcm9qZWN0cy50bXAvY2FwZ28vY2FwZ28tYXBwL3NjcmlwdHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9tYXJ0aW5kb25hZGlldS9Eb2N1bWVudHMvUHJvamVjdHMudG1wL2NhcGdvL2NhcGdvLWFwcC9zY3JpcHRzL3V0aWxzLm1qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvbWFydGluZG9uYWRpZXUvRG9jdW1lbnRzL1Byb2plY3RzLnRtcC9jYXBnby9jYXBnby1hcHAvc2NyaXB0cy91dGlscy5tanNcIjtpbXBvcnQgeyBjb25maWcgfSBmcm9tICdkb3RlbnYnXG5pbXBvcnQga2V5cyBmcm9tICcuLi9jb25maWdzLmpzb24nIGFzc2VydCB7dHlwZTogJ2pzb24nfVxuXG5jb25maWcoKVxuXG5leHBvcnQgY29uc3QgYnJhbmNoID0gcHJvY2Vzcy5lbnYuRU5WIHx8IHByb2Nlc3MuZW52LkJSQU5DSCB8fCAnbWFpbidcbmNvbnNvbGUubG9nKCdCcmFuY2gnLCBicmFuY2gpXG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSaWdodEtleShrZXluYW1lKSB7XG4gIC8vIGNvbnNvbGUubG9nKCdnZXRSaWdodEtleScsIGJyYW5jaCwga2V5bmFtZSlcbiAgaWYgKCFrZXlzIHx8ICFrZXlzW2tleW5hbWVdKVxuICAgIHJldHVybiAnJ1xuICBpZiAoYnJhbmNoID09PSAnZGV2ZWxvcG1lbnQnKVxuICAgIHJldHVybiBrZXlzW2tleW5hbWVdLmRldmVsb3BtZW50XG4gIGVsc2UgaWYgKGJyYW5jaCA9PT0gJ2xvY2FsJylcbiAgICByZXR1cm4ga2V5c1trZXluYW1lXS5sb2NhbFxuICByZXR1cm4ga2V5c1trZXluYW1lXS5wcm9kXG59XG5leHBvcnQgY29uc3Qgc3VwYV91cmwgPSBnZXRSaWdodEtleSgnc3VwYV91cmwnKVxuZXhwb3J0IGNvbnN0IHN1cGFfYW5vbiA9IGdldFJpZ2h0S2V5KCdzdXBhX2Fub24nKVxuIiwgIntcbiAgXCJiYXNlX2RvbWFpblwiOiB7XG4gICAgXCJwcm9kXCI6IFwid2ViLmNhcGdvLmFwcFwiLFxuICAgIFwiZGV2ZWxvcG1lbnRcIjogXCJkZXZlbG9wbWVudC5jYXBnby5hcHBcIixcbiAgICBcImxvY2FsXCI6IFwibG9jYWxob3N0OjMzMzJcIlxuICB9LFxuICBcInN1cGFfYW5vblwiOiB7XG4gICAgXCJwcm9kXCI6IFwiZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW5oMmQzcHdiMkY2YlhocmNXOXpjbVJsZDNsMklpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzTURnd056QXlOelVzSW1WNGNDSTZNakF5TXpZME5qSTNOWDAuc25hRjZpZG4xdG9lRkI0b043R2F4MWUwT2ZpUGpETzI4ZXA5MVNZYmtLQVwiLFxuICAgIFwiZGV2ZWxvcG1lbnRcIjogXCJleUpoYkdjaU9pSklVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKcGMzTWlPaUp6ZFhCaFltRnpaU0lzSW5KbFppSTZJbUYxWTNONVluWnVhR0YyYjJka2JYcDNkR04zSWl3aWNtOXNaU0k2SW1GdWIyNGlMQ0pwWVhRaU9qRTJOVFExTXprMU1EWXNJbVY0Y0NJNk1UazNNREV4TlRVd05uMC5IeXVabW9fRWpGNWZnWlFVM2czN2JkTmFyZEsxQ0xIZ3hYbVlxdHI1OWJvXCIsXG4gICAgXCJsb2NhbFwiOiBcImV5SmhiR2NpT2lKSVV6STFOaUlzSW5SNWNDSTZJa3BYVkNKOS5leUpwYzNNaU9pSnpkWEJoWW1GelpTMWtaVzF2SWl3aWNtOXNaU0k2SW1GdWIyNGlMQ0psZUhBaU9qRTVPRE00TVRJNU9UWjkuQ1JYUDFBN1dPZW9KZVh4ak5uaTQza2RRd2duV05SZWlsRE1ibFlUbl9JMFwiXG4gIH0sXG4gIFwic3VwYV91cmxcIjoge1xuICAgIFwicHJvZFwiOiBcImh0dHBzOi8veHZ3enBvYXpteGtxb3NyZGV3eXYuc3VwYWJhc2UuY29cIixcbiAgICBcImRldmVsb3BtZW50XCI6IFwiaHR0cHM6Ly9hdWNzeWJ2bmhhdm9nZG16d3Rjdy5zdXBhYmFzZS5jb1wiLFxuICAgIFwibG9jYWxcIjogXCJodHRwOi8vbG9jYWxob3N0OjU0MzIxXCJcbiAgfSxcbiAgXCJhcGlfZG9tYWluXCI6IHtcbiAgICBcInByb2RcIjogXCJhcGkuY2FwZ28uYXBwXCIsXG4gICAgXCJkZXZlbG9wbWVudFwiOiBcImFwaS1kZXYuY2FwZ28uYXBwXCIsXG4gICAgXCJsb2NhbFwiOiBcImxvY2FsaG9zdDo1NDMyMS9mdW5jdGlvbnMvdjFcIlxuICB9XG59XG4iLCAie1xuICBcIm5hbWVcIjogXCJjYXBnby1hcHBcIixcbiAgXCJ0eXBlXCI6IFwibW9kdWxlXCIsXG4gIFwidmVyc2lvblwiOiBcIjEwLjQ2Ny4wXCIsXG4gIFwicHJpdmF0ZVwiOiB0cnVlLFxuICBcInNjcmlwdHNcIjoge1xuICAgIFwiYnVpbGRcIjogXCJ2aXRlIGJ1aWxkXCIsXG4gICAgXCJ0ZXN0XCI6IFwicGxheXdyaWdodCB0ZXN0XCIsXG4gICAgXCJwcmV2aWV3XCI6IFwidml0ZSBwcmV2aWV3XCIsXG4gICAgXCJwcmV2aWV3LWh0dHBzXCI6IFwic2VydmUgZGlzdFwiLFxuICAgIFwibW9iaWxlXCI6IFwidml0ZSBidWlsZCAtLW1vZGUgbW9iaWxlICYmIGNhcCBjb3B5XCIsXG4gICAgXCJjYXBhY2l0b3ItYXNzZXRzXCI6IFwiYnVueCBAY2FwYWNpdG9yL2Fzc2V0cyBnZW5lcmF0ZSAtLWFzc2V0UGF0aCBhc3NldHMgLS1pY29uQmFja2dyb3VuZENvbG9yICcjMTExODI3JyAtLWljb25CYWNrZ3JvdW5kQ29sb3JEYXJrICcjMTExODI3JyAtLXNwbGFzaEJhY2tncm91bmRDb2xvciAnIzExMTgyNycgLS1zcGxhc2hCYWNrZ3JvdW5kQ29sb3JEYXJrICcjMTExODI3JyAtLWxvZ29TcGxhc2hTY2FsZSAwLjNcIixcbiAgICBcInJlc291cmNlc1wiOiBcImNvcmRvdmEtcmVzIC0tc2tpcC1jb25maWcgLS1jb3B5IC0taWNvbi1iYWNrZ3JvdW5kLXNvdXJjZSAnI2ZmZmZmZidcIixcbiAgICBcInN5bmNcIjogXCJjYXAgc3luY1wiLFxuICAgIFwic3luYzppb3NcIjogXCJjYXAgc3luYyBpb3NcIixcbiAgICBcInN5bmM6YW5kcm9pZFwiOiBcImNhcCBzeW5jIGFuZHJvaWRcIixcbiAgICBcInNlcnZlXCI6IFwidml0ZVwiLFxuICAgIFwicHJlYnVpbGQtc2VydmUtZGV2XCI6IFwiRU5WPWxvY2FsIHZpdGUgYnVpbGQgLS1zb3VyY2VtYXAgdHJ1ZSAtLW1pbmlmeSBmYWxzZSAtLWFzc2V0c0RpciAuICYmIGh0dHAtc2VydmVyIC4vZGlzdCAtcCA1MTczXCIsXG4gICAgXCJzZXJ2ZS1kZXZcIjogXCJFTlY9bG9jYWwgdml0ZVwiLFxuICAgIFwiYmFja2VuZFwiOiBcInN1cGFiYXNlIHN0YXJ0ICYmIHN1cGFiYXNlIGZ1bmN0aW9ucyBzZXJ2ZVwiLFxuICAgIFwicmVzZXRcIjogXCJzdXBhYmFzZSBkYiByZXNldFwiLFxuICAgIFwiZGV2LWJhY2tcIjogXCJ3cmFuZ2xlciBkZXYgY2xvdWRmbGFyZV93b3JrZXJzL2luZGV4LnRzXCIsXG4gICAgXCJkZXZcIjogXCJidW54IG5ldGxpZnkgZGV2IC0tcG9ydCA4ODgxXCIsXG4gICAgXCJ0ZXN0OmJhY2tlbmRcIjogXCJkZW5vIHJ1biAtLWFsbG93LWFsbCB0ZXN0c19iYWNrZW5kL3J1bl9iYWNrZW5kX3Rlc3RzLnRzIGJhY2tlbmRcIixcbiAgICBcInRlc3Q6Y2xpXCI6IFwiZGVubyBydW4gLS1hbGxvdy1hbGwgdGVzdHNfYmFja2VuZC9ydW5fYmFja2VuZF90ZXN0cy50cyBjbGlcIixcbiAgICBcInRlc3Q6c2VsZWN0YWJsZV9kaXNhbGxvd1wiOiBcImRlbm8gcnVuIC0tYWxsb3ctYWxsIHRlc3RzX2JhY2tlbmQvcnVuX2JhY2tlbmRfdGVzdHMudHMgc2VsZWN0YWJsZV9kaXNhbGxvd1wiLFxuICAgIFwidGVzdDphbGxcIjogXCJkZW5vIHJ1biAtLWFsbG93LWFsbCB0ZXN0c19iYWNrZW5kL3J1bl9iYWNrZW5kX3Rlc3RzLnRzIGFsbFwiLFxuICAgIFwidGVzdDp6b2RcIjogXCJkZW5vIHRlc3QgLS1hbGxvdy1hbGwgdGVzdHNfYmFja2VuZC96b2QudGVzdC50c1wiLFxuICAgIFwidGVzdDpvcmdhbml6YXRpb25cIjogXCJkZW5vIHJ1biAtLWFsbG93LWFsbCB0ZXN0c19iYWNrZW5kL3J1bl9iYWNrZW5kX3Rlc3RzLnRzIG9yZ2FuaXphdGlvblwiLFxuICAgIFwiZGV2LW1vYmlsZVwiOiBcIkJSQU5DSD1kZXZlbG9wbWVudCB2aXRlIGJ1aWxkIC0tbW9kZSBtb2JpbGUgJiYgY2FwIGNvcHlcIixcbiAgICBcImRldi1idWlsZFwiOiBcIkJSQU5DSD1kZXZlbG9wbWVudCB2aXRlIGJ1aWxkXCIsXG4gICAgXCJkZXYtc2VydmVcIjogXCJCUkFOQ0g9ZGV2ZWxvcG1lbnQgdml0ZVwiLFxuICAgIFwiZGV2LWlvc1wiOiBcImNhcCBzeW5jICYmIGNhcCBydW4gaW9zXCIsXG4gICAgXCJsb2NhbC1zZXJ2ZVwiOiBcIkJSQU5DSD1sb2NhbCB2aXRlXCIsXG4gICAgXCJsaW50XCI6IFwiZXNsaW50IFxcXCJzcmMvKiovKi57dnVlLHRzLGpzfVxcXCJcIixcbiAgICBcImxpbnQtYmFja2VuZFwiOiBcImVzbGludCBcXFwic3VwYWJhc2UvKiovKi57dnVlLHRzLGpzfVxcXCJcIixcbiAgICBcImRlcGxveTpjZl9zZXJ2ZXJsZXNzXCI6IFwid3JhbmdsZXIgZGVwbG95XCIsXG4gICAgXCJ0eXBlc1wiOiBcImJ1biAuL3NjcmlwdHMvZ2V0VHlwZXMubWpzXCIsXG4gICAgXCJkZXYtdHlwZXNcIjogXCJCUkFOQ0g9ZGV2ZWxvcG1lbnQgYnVuIC4vc2NyaXB0cy9nZXRUeXBlcy5tanNcIixcbiAgICBcInR5cGVjaGVja1wiOiBcInZ1ZS10c2MgLS1ub0VtaXRcIixcbiAgICBcImlvbmljOmJ1aWxkXCI6IFwidml0ZSBidWlsZFwiLFxuICAgIFwiaW9uaWM6c2VydmVcIjogXCJ2aXRlXCIsXG4gICAgXCJkMTpjbGVhclwiOiBcInJtIC1yZiAud3JhbmdsZXJcIixcbiAgICBcImQxOnNlZWRcIjogXCJidW54IHdyYW5nbGVyIGQxIGV4ZWN1dGUgLS1sb2NhbCAtLWNvbW1hbmQgXFxcIiQoY2F0IC4vc3VwYWJhc2UvZDEuc3FsKVxcXCIgY2FwZ29cIixcbiAgICBcImQxOmxvY2FsLXNydlwiOiBcImJ1bnggd3JhbmdsZXIgZGV2IC4vY2xvdWRmbGFyZV93b3JrZXJzL2QxLmpzIC0taXAgMC4wLjAuMCAtLXBvcnQgNjY1NVwiLFxuICAgIFwiZDE6bG9jYWwtY2xvbmVcIjogXCJTVVBBQkFTRV9VUkw9J3Bvc3RncmVzcWw6Ly9wb3N0Z3Jlczpwb3N0Z3Jlc0AxMjcuMC4wLjE6NTQzMjIvcG9zdGdyZXMnIEQxX1VSTD0naHR0cDovL2xvY2FsaG9zdDo2NjU1JyBkZW5vIHJ1biAtLWFsbG93LWFsbCBzdXBhYmFzZS9mdW5jdGlvbnMvc2NyaXB0L2R1cGxpY2F0ZV9pbl9kMS50c1wiLFxuICAgIFwiZDE6cmVzZXRcIjogXCJidW4gZDE6Y2xlYXIgJiYgYnVuIGQxOnNlZWRcIixcbiAgICBcImQxOmdlbmVyYXRlLW1pZ3JhdGlvblwiOiBcImRlbm8gcnVuIC0tYWxsb3ctYWxsIHN1cGFiYXNlL2Z1bmN0aW9ucy9zY3JpcHQvZ2VuZXJhdGVfZDFfcmVwbGljYXRpb25fc3FsX21pZ3JhdGlvbi50c1wiLFxuICAgIFwiY2YtZWRnZTpydW5cIjogXCJidW54IHdyYW5nbGVyIGRldiAtLXBvcnQgNzc3N1wiLFxuICAgIFwiY2YtYmFja2VuZF9kZXBsb3lcIjogXCJidW54IHdyYW5nbGVyIGRlcGxveVwiLFxuICAgIFwiY2YtYmFja2VuZF9kZXBsb3lfZW52XCI6IFwibm9kZSBzY3JpcHRzL2RlcGxveV9jZl9iYWNrZW5kX2Vudi5tanMgLmVudiBjYXBnb19hcGlcIixcbiAgICBcImNmLWJhY2tlbmRfZGVwbG95X2VudjphbHBoYVwiOiBcIm5vZGUgc2NyaXB0cy9kZXBsb3lfY2ZfYmFja2VuZF9lbnYubWpzIC5lbnYuYWxwaGEgY2FwZ29fYXBpLWFscGhhXCIsXG4gICAgXCJjZi1iYWNrZW5kX2RlcGxveV9lbnY6cHJlcHJvZFwiOiBcIm5vZGUgc2NyaXB0cy9kZXBsb3lfY2ZfYmFja2VuZF9lbnYubWpzIC5lbnYgY2FwZ29fYXBpLXByZXByb2RcIixcbiAgICBcInNpemVcIjogXCJidW54IHZpdGUtYnVuZGxlLXZpc3VhbGl6ZXJcIixcbiAgICBcIm1pbmlvOnN0YXJ0XCI6IFwiY2QgLi90ZXN0c19iYWNrZW5kL2doX2FjdGlvbnMgJiYgc2ggLi9taW5pby5zaCAmJiBjZCAuLi8uLlwiLFxuICAgIFwibWluaW86c2VlZFwiOiBcImNkIC4vdGVzdHNfYmFja2VuZC9naF9hY3Rpb25zICYmIHNoIC4vbWluaW8tc2VlZC5zaCAmJiBjZCAuLi8uLlwiLFxuICAgIFwibWluaW86ZGVsZXRlXCI6IFwiZG9ja2VyIHN0b3AgbWluaW8xICYmIGRvY2tlciBybSBtaW5pbzEgJiYgcm0gLXJmIC90bXAvbWluaW8tZGF0YVwiLFxuICAgIFwiY2xpY2tob3VzZTpzdGFydFwiOiBcImNkIC4vdGVzdHNfYmFja2VuZC9naF9hY3Rpb25zICYmIHNoIC4vY2xpY2tob3VzZS5zaCAmJiBjZCAuLi8uLlwiLFxuICAgIFwiY2xpY2tob3VzZTpzZWVkXCI6IFwiY2QgLi90ZXN0c19iYWNrZW5kL2doX2FjdGlvbnMgJiYgc2ggLi9jbGlja2hvdXNlLXNlZWQuc2ggJiYgY2QgLi4vLi5cIixcbiAgICBcImNsaWNraG91c2U6ZGVsZXRlXCI6IFwiZG9ja2VyIHN0b3Agc29tZS1jbGlja2hvdXNlLXNlcnZlciAmJiBkb2NrZXIgcm0gc29tZS1jbGlja2hvdXNlLXNlcnZlciAmJiBybSAtcmYgL3RtcC9jaF8qXCIsXG4gICAgXCJjbGlja2hvdXNlOmFkZC1sb2NhbFwiOiBcImRlbm8gcnVuIC0tYWxsb3ctYWxsIHN1cGFiYXNlL2Z1bmN0aW9ucy9fc2NyaXB0L2FkZF9jbGlja2hvdXNlX3RvX3N1cGFiYXNlLnRzXCJcbiAgfSxcbiAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgIFwiQGNhcGFjaXRvci1jb21tdW5pdHkva2VlcC1hd2FrZVwiOiBcIl40LjAuMFwiLFxuICAgIFwiQGNhcGFjaXRvci9hY3Rpb24tc2hlZXRcIjogXCJeNS4wLjdcIixcbiAgICBcIkBjYXBhY2l0b3IvYW5kcm9pZFwiOiBcIl41LjcuMFwiLFxuICAgIFwiQGNhcGFjaXRvci9hcHBcIjogXCJeNS4wLjdcIixcbiAgICBcIkBjYXBhY2l0b3IvYXBwLWxhdW5jaGVyXCI6IFwiXjUuMC43XCIsXG4gICAgXCJAY2FwYWNpdG9yL2Fzc2V0c1wiOiBcIjMuMC40XCIsXG4gICAgXCJAY2FwYWNpdG9yL2Jyb3dzZXJcIjogXCJeNS4yLjBcIixcbiAgICBcIkBjYXBhY2l0b3IvY2FtZXJhXCI6IFwiXjUuMC45XCIsXG4gICAgXCJAY2FwYWNpdG9yL2NsaXBib2FyZFwiOiBcIl41LjAuN1wiLFxuICAgIFwiQGNhcGFjaXRvci9kZXZpY2VcIjogXCJeNS4wLjdcIixcbiAgICBcIkBjYXBhY2l0b3IvZGlhbG9nXCI6IFwiXjUuMC43XCIsXG4gICAgXCJAY2FwYWNpdG9yL2ZpbGVzeXN0ZW1cIjogXCJeNS4yLjFcIixcbiAgICBcIkBjYXBhY2l0b3IvZ2VvbG9jYXRpb25cIjogXCJeNS4wLjdcIixcbiAgICBcIkBjYXBhY2l0b3IvaGFwdGljc1wiOiBcIl41LjAuN1wiLFxuICAgIFwiQGNhcGFjaXRvci9pb3NcIjogXCJeNS43LjBcIixcbiAgICBcIkBjYXBhY2l0b3Iva2V5Ym9hcmRcIjogXCJeNS4wLjhcIixcbiAgICBcIkBjYXBhY2l0b3IvbG9jYWwtbm90aWZpY2F0aW9uc1wiOiBcIl41LjAuN1wiLFxuICAgIFwiQGNhcGFjaXRvci9tb3Rpb25cIjogXCJeNS4wLjdcIixcbiAgICBcIkBjYXBhY2l0b3IvbmV0d29ya1wiOiBcIl41LjAuN1wiLFxuICAgIFwiQGNhcGFjaXRvci9wcmVmZXJlbmNlc1wiOiBcIl41LjAuN1wiLFxuICAgIFwiQGNhcGFjaXRvci9wdXNoLW5vdGlmaWNhdGlvbnNcIjogXCJeNS4xLjFcIixcbiAgICBcIkBjYXBhY2l0b3Ivc2NyZWVuLXJlYWRlclwiOiBcIl41LjAuN1wiLFxuICAgIFwiQGNhcGFjaXRvci9zaGFyZVwiOiBcIl41LjAuN1wiLFxuICAgIFwiQGNhcGFjaXRvci9zcGxhc2gtc2NyZWVuXCI6IFwiXjUuMC43XCIsXG4gICAgXCJAY2FwYWNpdG9yL3N0YXR1cy1iYXJcIjogXCJeNS4wLjdcIixcbiAgICBcIkBjYXBhY2l0b3IvdGV4dC16b29tXCI6IFwiXjUuMC43XCIsXG4gICAgXCJAY2FwYWNpdG9yL3RvYXN0XCI6IFwiXjUuMC43XCIsXG4gICAgXCJAY2FwYXdlc29tZS9jYXBhY2l0b3ItZmlsZS1waWNrZXJcIjogXCJeNS4zLjBcIixcbiAgICBcIkBjYXBhd2Vzb21lL2NhcGFjaXRvci1zY3JlZW4tb3JpZW50YXRpb25cIjogXCJeNS4wLjFcIixcbiAgICBcIkBjYXBnby9jYXBhY2l0b3ItY3Jpc3BcIjogXCJeMi4wLjE2XCIsXG4gICAgXCJAY2FwZ28vY2FwYWNpdG9yLWZsYXNoXCI6IFwiXjIuMC4xNFwiLFxuICAgIFwiQGNhcGdvL2NhcGFjaXRvci1tdXRlXCI6IFwiXjIuMC4xM1wiLFxuICAgIFwiQGNhcGdvL2NhcGFjaXRvci1uYXRpdmUtYmlvbWV0cmljXCI6IFwiXjUuMS4wXCIsXG4gICAgXCJAY2FwZ28vY2FwYWNpdG9yLXNjcmVlbi1yZWNvcmRlclwiOiBcIl41LjAuMFwiLFxuICAgIFwiQGNhcGdvL2NhcGFjaXRvci11cGRhdGVyXCI6IFwiNS42LjJcIixcbiAgICBcIkBjYXBnby9nb29nbGUtcGxheS1zY3JhcGVyXCI6IFwiXjkuMS4yXCIsXG4gICAgXCJAY2FwZ28vaW5hcHBicm93c2VyXCI6IFwiXjEuMy4zXCIsXG4gICAgXCJAY2FwZ28vbmF0aXZlLWF1ZGlvXCI6IFwiXjYuMS4zNlwiLFxuICAgIFwiQGNhcGdvL25hdGl2ZS1tYXJrZXRcIjogXCJeNS4wLjVcIixcbiAgICBcIkBjYXBnby9zMy1saXRlLWNsaWVudFwiOiBcIjAuMS44XCIsXG4gICAgXCJAZm9ybWtpdC9hdXRvLWFuaW1hdGVcIjogXCIxLjAuMC1wcmUtYWxwaGEuM1wiLFxuICAgIFwiQGZvcm1raXQvdGhlbWVzXCI6IFwiMS41LjlcIixcbiAgICBcIkBmb3Jta2l0L3Z1ZVwiOiBcIjEuNS45XCIsXG4gICAgXCJAaW50bGlmeS91bnBsdWdpbi12dWUtaTE4blwiOiBcIl4yLjAuMFwiLFxuICAgIFwiQGxvZ3NuYWcvbm9kZVwiOiBcIjEuMC4xXCIsXG4gICAgXCJAbmV0bGlmeS9mdW5jdGlvbnNcIjogXCJeMi42LjBcIixcbiAgICBcIkByZXZlbnVlY2F0L3B1cmNoYXNlcy1jYXBhY2l0b3JcIjogXCJeNy41LjJcIixcbiAgICBcIkBzdXBhYmFzZS9zdXBhYmFzZS1qc1wiOiBcIjIuMzkuNlwiLFxuICAgIFwiQHRhaWx3aW5kY3NzL2Zvcm1zXCI6IFwiXjAuNS43XCIsXG4gICAgXCJAdnVldXNlL2NvbXBvbmVudHNcIjogXCJeMTAuNy4yXCIsXG4gICAgXCJAdnVldXNlL2NvcmVcIjogXCIxMC43LjJcIixcbiAgICBcIkB6aXAuanMvemlwLmpzXCI6IFwiMi43LjM0XCIsXG4gICAgXCJhZG0temlwXCI6IFwiXjAuNS4xMFwiLFxuICAgIFwiYXRyb3Bvc1wiOiBcIl4xLjAuMlwiLFxuICAgIFwiYmFzZTY0LWFycmF5YnVmZmVyXCI6IFwiMS4wLjJcIixcbiAgICBcImJ1bi10eXBlc1wiOiBcIl4xLjAuMjZcIixcbiAgICBcImNhcGFjaXRvci1yYXRlLWFwcFwiOiBcIjQuMC4zXCIsXG4gICAgXCJjYXBhY2l0b3Itc2VjdXJlLXN0b3JhZ2UtcGx1Z2luXCI6IFwiXjAuOS4wXCIsXG4gICAgXCJjaGFydC5qc1wiOiBcIl40LjQuMVwiLFxuICAgIFwiY2hhcnRqcy1hZGFwdGVyLWRheWpzXCI6IFwiXjEuMC4wXCIsXG4gICAgXCJjaGFydGpzLXBsdWdpbi1hbm5vdGF0aW9uXCI6IFwiXjMuMC4xXCIsXG4gICAgXCJjb3B5LXRleHQtdG8tY2xpcGJvYXJkXCI6IFwiXjMuMi4wXCIsXG4gICAgXCJjb3VudHJ5LWNvZGUtdG8tZmxhZy1lbW9qaVwiOiBcIl4xLjMuMlwiLFxuICAgIFwiY3Jvbi1zY2hlZHVsZVwiOiBcIl40LjAuMFwiLFxuICAgIFwiY3J5cHRvLXJhbmRvbS1zdHJpbmdcIjogXCJeNS4wLjBcIixcbiAgICBcImRhaXN5dWlcIjogXCJeNC43LjJcIixcbiAgICBcImRheWpzXCI6IFwiMS4xMS4xMFwiLFxuICAgIFwiZG9tcHVyaWZ5XCI6IFwiXjMuMC44XCIsXG4gICAgXCJkcml6emxlLW9ybVwiOiBcIl4wLjI5LjNcIixcbiAgICBcImZpcmViYXNlXCI6IFwiMTAuOC4wXCIsXG4gICAgXCJmbG93Yml0ZVwiOiBcIl4yLjMuMFwiLFxuICAgIFwiZ2VuZXJhdGUtcGFzc3dvcmQtYnJvd3NlclwiOiBcIl4xLjEuMFwiLFxuICAgIFwiZ29vZ2xlLXBsYXktc2NyYXBlclwiOiBcIl45LjIuMFwiLFxuICAgIFwiaG9ub1wiOiBcIjQuMC41XCIsXG4gICAgXCJqc29uMmNzdlwiOiBcIl41LjAuN1wiLFxuICAgIFwia29uc3RhXCI6IFwiXjMuMS4yXCIsXG4gICAgXCJreVwiOiBcIl4xLjIuMFwiLFxuICAgIFwibGF1cWVcIjogXCJeMS41LjBcIixcbiAgICBcImxvZGFzaC5kZWJvdW5jZVwiOiBcIl40LjAuOFwiLFxuICAgIFwibG9nc25hZ1wiOiBcIl4xLjAuMFwiLFxuICAgIFwibWltZVwiOiBcIjQuMC4xXCIsXG4gICAgXCJucHJvZ3Jlc3NcIjogXCIxLjAuMC0xXCIsXG4gICAgXCJwaW5pYVwiOiBcIjIuMS43XCIsXG4gICAgXCJwbGF1c2libGUtdHJhY2tlclwiOiBcIl4wLjMuOFwiLFxuICAgIFwicG9zdGdyZXNcIjogXCJeMy40LjNcIixcbiAgICBcInByaXNtLXRoZW1lLXZhcnNcIjogXCJeMC4yLjRcIixcbiAgICBcInNlbXZlclwiOiBcIl43LjYuMFwiLFxuICAgIFwic3RyaXBlXCI6IFwiXjE0LjE3LjBcIixcbiAgICBcInVucGx1Z2luLWF1dG8taW1wb3J0XCI6IFwiXjAuMTcuNVwiLFxuICAgIFwidW5wbHVnaW4tdnVlLW1hY3Jvc1wiOiBcIl4yLjcuMTBcIixcbiAgICBcInVucGx1Z2luLXZ1ZS1yb3V0ZXJcIjogXCJeMC43LjBcIixcbiAgICBcInZpdGUtcGx1Z2luLXZ1ZS1kZXZ0b29sc1wiOiBcIl43LjAuMTVcIixcbiAgICBcInZpdGUtcGx1Z2luLXdlYmZvbnQtZGxcIjogXCJeMy45LjFcIixcbiAgICBcInZ1ZVwiOiBcIjMuNC4xOVwiLFxuICAgIFwidnVlLWNoYXJ0anNcIjogXCJeNS4zLjBcIixcbiAgICBcInZ1ZS1kZW1pXCI6IFwiMC4xNC43XCIsXG4gICAgXCJ2dWUtaTE4blwiOiBcIjkuOS4xXCIsXG4gICAgXCJ2dWUtcm91dGVyXCI6IFwiNC4yLjVcIixcbiAgICBcInZ1ZS1zb25uZXJcIjogXCJeMS4wLjNcIixcbiAgICBcInpvZFwiOiBcIl4zLjIyLjRcIlxuICB9LFxuICBcImRldkRlcGVuZGVuY2llc1wiOiB7XG4gICAgXCJAYW50ZnUvZXNsaW50LWNvbmZpZ1wiOiBcIjIuNi40XCIsXG4gICAgXCJAY2FwYWNpdG9yL2NsaVwiOiBcIl41LjcuMFwiLFxuICAgIFwiQGNhcGFjaXRvci9jb3JlXCI6IFwiXjUuNy4wXCIsXG4gICAgXCJAY2xvdWRmbGFyZS93b3JrZXJzLXR5cGVzXCI6IFwiXjQuMjAyNDAyMDguMFwiLFxuICAgIFwiQGljb25pZnktanNvbi9jYXJib25cIjogXCIxLjEuMzBcIixcbiAgICBcIkBpY29uaWZ5LWpzb24vaGVyb2ljb25zXCI6IFwiXjEuMS4yMFwiLFxuICAgIFwiQGljb25pZnktanNvbi9pb25cIjogXCIxLjEuMTVcIixcbiAgICBcIkBpY29uaWZ5LWpzb24vbHNcIjogXCIxLjEuOFwiLFxuICAgIFwiQGljb25pZnkvanNvblwiOiBcIl4yLjIuMTgzXCIsXG4gICAgXCJAcGxheXdyaWdodC90ZXN0XCI6IFwiMS40MS4yXCIsXG4gICAgXCJAdGFpbHdpbmRjc3MvYXNwZWN0LXJhdGlvXCI6IFwiXjAuNC4yXCIsXG4gICAgXCJAdGFpbHdpbmRjc3MvY29udGFpbmVyLXF1ZXJpZXNcIjogXCJeMC4xLjFcIixcbiAgICBcIkB0YWlsd2luZGNzcy90eXBvZ3JhcGh5XCI6IFwiXjAuNS4xMFwiLFxuICAgIFwiQHR5cGVzL2FkbS16aXBcIjogXCJeMC41LjVcIixcbiAgICBcIkB0eXBlcy9kZWVwLWRpZmZcIjogXCIxLjAuNVwiLFxuICAgIFwiQHR5cGVzL2RvbXB1cmlmeVwiOiBcIjMuMC41XCIsXG4gICAgXCJAdHlwZXMvZW1vamktZmxhZ3NcIjogXCJeMS4zLjNcIixcbiAgICBcIkB0eXBlcy9mcy1leHRyYVwiOiBcIl4xMS4wLjRcIixcbiAgICBcIkB0eXBlcy9sb2Rhc2guZGVib3VuY2VcIjogXCJeNC4wLjlcIixcbiAgICBcIkB0eXBlcy9taW5pb1wiOiBcIl43LjEuMVwiLFxuICAgIFwiQHR5cGVzL25wcm9ncmVzc1wiOiBcIl4wLjIuM1wiLFxuICAgIFwiQHR5cGVzL3V1aWRcIjogXCI5LjAuOFwiLFxuICAgIFwiQHZpdGVqcy9wbHVnaW4tdnVlXCI6IFwiNS4wLjRcIixcbiAgICBcIkB2aXRlanMvcGx1Z2luLXZ1ZS1qc3hcIjogXCJeMy4xLjBcIixcbiAgICBcIkB2dWUvY2xpLXNlcnZpY2VcIjogXCI1LjAuOFwiLFxuICAgIFwiQHZ1ZS9jb21waWxlci1zZmNcIjogXCIzLjQuMTlcIixcbiAgICBcIkB2dWUvc2VydmVyLXJlbmRlcmVyXCI6IFwiMy40LjE5XCIsXG4gICAgXCJhdXRvcHJlZml4ZXJcIjogXCJeMTAuNC4xN1wiLFxuICAgIFwiY3JpdHRlcnNcIjogXCIwLjAuMjBcIixcbiAgICBcImNyb3NzLWVudlwiOiBcIl43LjAuM1wiLFxuICAgIFwiZGVlcC1kaWZmXCI6IFwiMS4wLjJcIixcbiAgICBcImVzbGludFwiOiBcIjguNTYuMFwiLFxuICAgIFwiaHR0cC1zZXJ2ZXJcIjogXCJeMTQuMS4xXCIsXG4gICAgXCJodHRwcy1sb2NhbGhvc3RcIjogXCI0LjcuMVwiLFxuICAgIFwiaHVza3lcIjogXCJeOS4wLjEwXCIsXG4gICAgXCJtaW5pZmxhcmVcIjogXCJeMy4yMDI0MDEyOS4zXCIsXG4gICAgXCJwb3N0Y3NzXCI6IFwiXjguNC4zNVwiLFxuICAgIFwic2Fzc1wiOiBcIjEuNzEuMFwiLFxuICAgIFwidGFpbHdpbmRjc3NcIjogXCJeMy40LjFcIixcbiAgICBcInR5cGVzY3JpcHRcIjogXCI1LjMuM1wiLFxuICAgIFwidW5wbHVnaW4taWNvbnNcIjogXCIwLjE4LjVcIixcbiAgICBcInVucGx1Z2luLXZ1ZS1jb21wb25lbnRzXCI6IFwiXjAuMjYuMFwiLFxuICAgIFwidml0ZVwiOiBcIjUuMS4zXCIsXG4gICAgXCJ2aXRlLXBsdWdpbi1lbnZpcm9ubWVudFwiOiBcIjEuMS4zXCIsXG4gICAgXCJ2aXRlLXBsdWdpbi1wd2FcIjogXCIwLjE4LjJcIixcbiAgICBcInZpdGUtcGx1Z2luLXZ1ZS1sYXlvdXRzXCI6IFwiMC4xMS4wXCIsXG4gICAgXCJ2aXRlc3RcIjogXCIxLjMuMFwiLFxuICAgIFwidnVlLXRzY1wiOiBcIjEuOC4yN1wiLFxuICAgIFwid3JhbmdsZXJcIjogXCIzLjI4LjNcIlxuICB9LFxuICBcImh1c2t5XCI6IHtcbiAgICBcImhvb2tzXCI6IHtcbiAgICAgIFwicHJlLWNvbW1pdFwiOiBcImJ1biBydW4gbGludFwiXG4gICAgfVxuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXdXLE9BQU8sVUFBVTtBQUN6WCxPQUFPLGdCQUFnQjtBQUN2QixPQUFPLGVBQWU7QUFDdEIsT0FBTyxhQUFhO0FBQ3BCLE9BQU8saUJBQWlCO0FBQ3hCLE9BQU8scUJBQXFCO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsbUJBQW1CO0FBQzVCLE9BQU8sU0FBUztBQUdoQixTQUFTLG9CQUFvQjtBQUM3QixPQUFPLGVBQWU7QUFDdEIsT0FBTyxhQUFhO0FBQ3BCLE9BQU8sV0FBVztBQUNs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QTJCO0FBQUEsSUFDM0IscUJBQXFCO0FBQUEsSUFDckIsc0JBQXNCO0FBQUEsSUFDdEIscUJBQXFCO0FBQUEsSUFDckIsd0JBQXdCO0FBQUEsSUFDeEIscUJBQXFCO0FBQUEsSUFDckIscUJBQXFCO0FBQUEsSUFDckIseUJBQXlCO0FBQUEsSUFDekIsMEJBQTBCO0FBQUEsSUFDMUIsc0JBQXNCO0FBQUEsSUFDdEIsa0JBQWtCO0FBQUEsSUFDbEIsdUJBQXVCO0FBQUEsSUFDdkIsa0NBQWtDO0FBQUEsSUFDbEMscUJBQXFCO0FBQUEsSUFDckIsc0JBQXNCO0FBQUEsSUFDdEIsMEJBQTBCO0FBQUEsSUFDMUIsaUNBQWlDO0FBQUEsSUFDakMsNEJBQTRCO0FBQUEsSUFDNUIsb0JBQW9CO0FBQUEsSUFDcEIsNEJBQTRCO0FBQUEsSUFDNUIseUJBQXlCO0FBQUEsSUFDekIsd0JBQXdCO0FBQUEsSUFDeEIsb0JBQW9CO0FBQUEsSUFDcEIscUNBQXFDO0FBQUEsSUFDckMsNENBQTRDO0FBQUEsSUFDNUMsMEJBQTBCO0FBQUEsSUFDMUIsMEJBQTBCO0FBQUEsSUFDMUIseUJBQXlCO0FBQUEsSUFDekIscUNBQXFDO0FBQUEsSUFDckMsb0NBQW9DO0FBQUEsSUFDcEMsNEJBQTRCO0FBQUEsSUFDNUIsOEJBQThCO0FBQUEsSUFDOUIsdUJBQXVCO0FBQUEsSUFDdkIsdUJBQXVCO0FBQUEsSUFDdkIsd0JBQXdCO0FBQUEsSUFDeEIseUJBQXlCO0FBQUEsSUFDekIseUJBQXlCO0FBQUEsSUFDekIsbUJBQW1CO0FBQUEsSUFDbkIsZ0JBQWdCO0FBQUEsSUFDaEIsOEJBQThCO0FBQUEsSUFDOUIsaUJBQWlCO0FBQUEsSUFDakIsc0JBQXNCO0FBQUEsSUFDdEIsbUNBQW1DO0FBQUEsSUFDbkMseUJBQXlCO0FBQUEsSUFDekIsc0JBQXNCO0FBQUEsSUFDdEIsc0JBQXNCO0FBQUEsSUFDdEIsZ0JBQWdCO0FBQUEsSUFDaEIsa0JBQWtCO0FBQUEsSUFDbEIsV0FBVztBQUFBLElBQ1gsU0FBVztBQUFBLElBQ1gsc0JBQXNCO0FB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
