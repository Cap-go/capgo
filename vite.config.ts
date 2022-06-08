/// <reference types="vitest" />
import path from 'path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Pages from 'vite-plugin-pages'
import { viteCommonjs, esbuildCommonjs } from '@originjs/vite-plugin-commonjs'
import Layouts from 'vite-plugin-vue-layouts'
import Icons from 'unplugin-icons/vite'
import WindiCSS from 'vite-plugin-windicss'
import { VitePWA } from 'vite-plugin-pwa'
import VueI18n from '@intlify/vite-plugin-vue-i18n'
import Inspect from 'vite-plugin-inspect'
import EnvironmentPlugin from 'vite-plugin-environment'
import pack from './package.json'
import keys from './configs.json'

const getRightKey = (branch: string, keyname: 'base_domain' | 'supa_anon' | 'supa_url'): string => {
  console.log('getRightKey', branch, keyname)
  if (branch === 'development')
    return keys[keyname].development
  else if (branch === 'local')
    return keys[keyname].local
  return keys[keyname].prod
}

const getUrl = (branch = ''): string => {
  if (branch === 'local')
    return `http://${getRightKey(branch, 'base_domain')}`
  else
    return `https://${getRightKey(branch, 'base_domain')}`
}

const markdownWrapperClasses = 'prose prose-xl m-auto text-left'
const guestPath = ['/login', '/register', '/forgot_password', '/onboarding/confirm_email', '/onboarding/verify_email', '/onboarding/activation', '/onboarding/set_password']

export default defineConfig({
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  plugins: [
    viteCommonjs(),
    Vue({
      include: [/\.vue$/, /\.md$/],
    }),

    EnvironmentPlugin({
      VITE_APP_VERSION: pack.version,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || getRightKey(process.env.BRANCH || '', 'supa_anon'),
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || getRightKey(process.env.BRANCH || '', 'supa_url'),
      VITE_APP_URL: `${getUrl(process.env.BRANCH)}`,
      VITE_BRANCH: process.env.BRANCH || 'main',
      package_dependencies: JSON.stringify(pack.dependencies),
      domain: getUrl(process.env.BRANCH),
      crisp: 'e7dbcfa4-91b1-4b74-b563-b9234aeb2eee',
    }, { defineOn: 'import.meta.env' }),

    // https://github.com/hannoeru/vite-plugin-pages
    Pages({
      extensions: ['vue', 'md'],
      // onRoutesGenerated(routes) {
      //   console.log('routes', routes)
      // },
      extendRoute: (route) => {
        if (guestPath.includes(route.path))
          return route
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

    // https://github.com/antfu/vite-plugin-windicss
    WindiCSS({
      safelist: markdownWrapperClasses,
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

    // https://github.com/intlify/bundle-tools/tree/main/packages/vite-plugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      include: [path.resolve(__dirname, 'locales/**')],
    }),

    // https://github.com/antfu/vite-plugin-inspect
    Inspect({
      // change this to enable inspect for debugging
      enabled: false,
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
    esbuildOptions:{
      plugins:[
        esbuildCommonjs([]) 
      ]
    }
  },

  test: {
    include: ['test/**/*.test.ts'],
    environment: 'jsdom',
    deps: {
      inline: ['@vue', '@vueuse', 'vue-demi'],
    },
  },
})
