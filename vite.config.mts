import path from 'node:path'
import { readdirSync } from 'node:fs'
import AutoImport from 'unplugin-auto-import/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import WebfontDownload from 'vite-plugin-webfont-dl'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import Vue from '@vitejs/plugin-vue'

// import veauryVitePlugins from 'veaury/vite/index'
import { defineConfig } from 'vite'
import VueRouter from 'unplugin-vue-router/vite'
import Layouts from 'vite-plugin-vue-layouts'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Components from 'unplugin-vue-components/vite'
import { VitePWA } from 'vite-plugin-pwa'
import EnvironmentPlugin from 'vite-plugin-environment'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import formkit from 'unplugin-formkit/vite'
import { branch, getRightKey } from './scripts/utils.mjs'
import pack from './package.json'

function getUrl(key = 'base_domain'): string {
  if (branch === 'local')
    return `http://${getRightKey(key)}`
  else
    return `https://${getRightKey(key)}`
}

const locales: string[] = []
readdirSync('./locales/')
  .forEach((file) => {
    if (file.split('.')[0] !== 'README')
      locales.push(file.split('.')[0])
  })

export default defineConfig({
  define: {
    __VUE_OPTIONS_API__: 'true',
  },
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  plugins: [
    formkit({}),

    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/],
        }),

      },
    }),
    Components({
      extensions: ['vue'],
      // allow auto import and register components used in markdown
      include: [/\.vue$/, /\.vue\?vue/],
      dts: 'src/components.d.ts',
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
      VITE_API_HOST: `${getUrl('api_domain')}`,
      VITE_BRANCH: branch,
      package_dependencies: JSON.stringify(pack.dependencies),
      domain: getUrl(),
      pls_domain: 'web.capgo.app',
      logsnag: 'c124f5e9d0ce5bdd14bbb48f815d5583',
      logsnag_project: 'capgo',
      crisp: 'e7dbcfa4-91b1-4b74-b563-b9234aeb2eee',
    }, { defineOn: 'import.meta.env' }),

    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      extensions: ['.vue', '.md'],
      dts: 'src/typed-router.d.ts',
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),
    // https://github.com/antfu/unplugin-icons
    Icons({
      autoInstall: true,
    }),

    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      imports: [
        'vue',
        'vue-i18n',
        '@vueuse/head',
        '@vueuse/core',
        VueRouterAutoImports,
        {
          // add any other imports you were relying on
          'vue-router/auto': ['useLink'],
        },
      ],
      dts: 'src/auto-imports.d.ts',
      dirs: [
        'src/composables',
        'src/stores',
      ],
      vueTemplate: true,
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
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
      include: [path.resolve(__dirname, 'locales/**')],
    }),

    // https://github.com/feat-agency/vite-plugin-webfont-dl
    WebfontDownload(),

    // https://github.com/webfansplz/vite-plugin-vue-devtools
    VueDevTools({
      componentInspector: false,
    }),
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
