/// <reference types="vitest" />
import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
// import veauryVitePlugins from 'veaury/vite/index'
import { defineConfig } from 'vite'
import Pages from 'vite-plugin-pages'
import Layouts from 'vite-plugin-vue-layouts'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Components from 'unplugin-vue-components/vite'
import { VitePWA } from 'vite-plugin-pwa'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import Inspector from 'vite-plugin-vue-inspector'
import Inspect from 'vite-plugin-inspect'
import EnvironmentPlugin from 'vite-plugin-environment'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { readdirSync } from 'fs-extra'
import { branch, getRightKey } from './scripts/utils.mjs'
import pack from './package.json'

function getUrl(): string {
  if (branch === 'local')
    return `http://${getRightKey('base_domain')}`
  else
    return `https://${getRightKey('base_domain')}`
}

const locales: string[] = []
readdirSync('./locales/')
  .forEach((file) => {
    if (file.split('.')[0] !== 'README')
      locales.push(file.split('.')[0])
  })
// const markdownWrapperClasses = 'prose prose-xl m-auto text-left'
const guestPath = ['/login', '/register', '/forgot_password', '/onboarding/confirm_email', '/onboarding/verify_email', '/onboarding/activation', '/onboarding/set_password']

export default defineConfig({
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  plugins: [
    Vue({
      include: [/\.vue$/, /\.md$/],
    }),
    // veauryVitePlugins({
    //   type: 'vue',
    //   // Configuration of @vitejs/plugin-vue
    //   vueOptions: {
    //     include: [/\.vue$/, /\.md$/],
    //   },
    //   // Configuration of @vitejs/plugin-react
    //   // reactOptions: {...},
    //   // Configuration of @vitejs/plugin-vue-jsx
    //   // vueJsxOptions: {...}
    // }),
    Components({
      resolvers: [
        IconsResolver(),
        ElementPlusResolver({
          importStyle: 'sass',
        }),
      ],
    }),
    EnvironmentPlugin({
      locales: locales.join(','),
      VITE_APP_VERSION: pack.version,
      VITE_SUPABASE_ANON_KEY: getRightKey('supa_anon'),
      VITE_SUPABASE_URL: getRightKey('supa_url'),
      VITE_APP_URL: `${getUrl()}`,
      VITE_BRANCH: branch,
      package_dependencies: JSON.stringify(pack.dependencies),
      domain: getUrl(),
      pls_domain: 'web.capgo.app',
      logsnag: 'c124f5e9d0ce5bdd14bbb48f815d5583',
      crisp: 'e7dbcfa4-91b1-4b74-b563-b9234aeb2eee',
    }, { defineOn: 'import.meta.env' }),

    // https://github.com/hannoeru/vite-plugin-pages
    Pages({
      resolver: 'vue',
      extensions: ['vue', 'md'],
      // onRoutesGenerated(routes) {
      //   console.log('routes', routes)
      // },
      extendRoute: (route) => {
        if (guestPath.includes(route.path)) {
          return {
            ...route,
            meta: { ...route.meta, layout: 'auth' },
          }
        }
        // Augment the route with meta that indicates that the route requires authentication.
        return {
          ...route,
          meta: { ...route.meta, middleware: 'auth' },
        }
      },
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),
    // https://github.com/antfu/unplugin-icons
    Icons({
      autoInstall: true,
    }),

    // https://github.com/antfu/vite-plugin-pwa
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'safari-pinned-tab.svg'],
      manifest: {
        name: 'Capgo',
        short_name: 'CapGo',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18nPlugin({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
      include: [path.resolve(__dirname, 'locales/**')],
      // availableLocales: [path.resolve(__dirname, 'locales/**')
    }),

    // https://github.com/antfu/vite-plugin-inspect
    // Visit http://localhost:3333/__inspect/ to see the inspector
    Inspect(),

    // https://github.com/webfansplz/vite-plugin-vue-inspector
    Inspector({
      toggleButtonVisibility: 'never',
    }),
    // ViteImagemin({
    //   gifsicle: {
    //     optimizationLevel: 7,
    //     interlaced: false,
    //   },
    //   optipng: {
    //     optimizationLevel: 7,
    //   },
    //   mozjpeg: {
    //     quality: 20,
    //   },
    //   pngquant: {
    //     quality: [0.8, 0.9],
    //     speed: 4,
    //   },
    //   svgo: {
    //     plugins: [
    //       {
    //         name: 'removeViewBox',
    //       },
    //       {
    //         name: 'removeEmptyAttrs',
    //         active: false,
    //       },
    //     ],
    //   },
    // }),
  ],

  server: {
    fs: {
      strict: true,
    },
  },

  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      '@vueuse/core',
    ],
    exclude: [
      'vue-demi',
    ],
  },

  // https://github.com/vitest-dev/vitest
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'jsdom',
    deps: {
      inline: ['@vue', '@vueuse', 'vue-demi'],
    },
  },
})
