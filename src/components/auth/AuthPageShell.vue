<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface HighlightItem {
  title: string
  description: string
}

const props = withDefaults(defineProps<{
  badgeText?: string
  cardDescription?: string
  cardKicker?: string
  cardTitle: string
  cardWidthClass?: string
  chips?: string[]
  heroDescription?: string
  heroHighlights?: HighlightItem[]
  heroKicker?: string
  heroTitle?: string
}>(), {
  badgeText: import.meta.env.VITE_APP_VERSION,
  cardDescription: '',
  cardKicker: '',
  cardWidthClass: 'max-w-lg',
  chips: undefined,
  heroDescription: '',
  heroHighlights: undefined,
  heroKicker: '',
  heroTitle: '',
})

const { t } = useI18n()

const heroKickerValue = computed(() => props.heroKicker || t('login-console-kicker'))
const heroTitleValue = computed(() => props.heroTitle || t('login-console-title'))
const heroDescriptionValue = computed(() => props.heroDescription || t('login-console-description'))
const heroChips = computed(() => props.chips ?? [
  t('login-chip-live-updates'),
  t('login-chip-release-analytics'),
  t('login-chip-channel-control'),
])
const heroHighlights = computed(() => props.heroHighlights ?? [
  {
    title: t('login-highlight-rollouts-title'),
    description: t('login-highlight-rollouts-description'),
  },
  {
    title: t('login-highlight-observability-title'),
    description: t('login-highlight-observability-description'),
  },
  {
    title: t('login-highlight-team-title'),
    description: t('login-highlight-team-description'),
  },
])
</script>

<template>
  <section
    class="relative flex min-h-screen w-full overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(238,244,255,0.92)_55%,rgba(248,250,252,0.98)_100%)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98)_0%,rgba(20,29,53,0.96)_52%,rgba(15,23,42,0.98)_100%)]"
  >
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="absolute top-[10%] -left-32 h-[22rem] w-[22rem] rounded-full bg-[rgba(17,158,255,0.22)] opacity-55 blur-[52px]" />
      <div class="absolute right-[-7rem] bottom-[8%] h-[18rem] w-[18rem] rounded-full bg-[rgba(104,118,225,0.18)] opacity-55 blur-[52px]" />
      <div
        class="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:3rem_3rem] [mask-image:radial-gradient(circle_at_center,black_40%,transparent_82%)]"
      />
    </div>

    <div class="relative mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:min-h-screen lg:grid-cols-[minmax(0,1.04fr)_minmax(24rem,38rem)] lg:items-center lg:px-8 lg:py-10">
      <section class="hidden lg:block">
        <div class="max-w-2xl">
          <div class="inline-flex flex-wrap gap-2">
            <span
              v-for="chip in heroChips"
              :key="chip"
              class="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium tracking-[0.18em] text-slate-600 uppercase shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200"
            >
              {{ chip }}
            </span>
          </div>

          <div class="mt-8 space-y-5">
            <div class="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/70 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/70">
              <img src="/capgo.webp" alt="Capgo logo" class="h-8 w-8 rounded-sm invert dark:invert-0">
            </div>
            <div>
              <p class="text-xs font-semibold tracking-[0.26em] text-slate-500 uppercase dark:text-slate-300">
                {{ heroKickerValue }}
              </p>
              <h1 class="mt-4 text-4xl font-semibold leading-tight text-slate-950 dark:text-white xl:text-5xl">
                {{ heroTitleValue }}
              </h1>
              <p class="mt-5 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300 xl:text-lg">
                {{ heroDescriptionValue }}
              </p>
            </div>
          </div>

          <div class="mt-10 grid gap-4 sm:grid-cols-3">
            <article
              v-for="highlight in heroHighlights"
              :key="highlight.title"
              class="rounded-3xl border border-white/70 bg-white/78 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/72"
            >
              <div class="mb-3 h-2 w-12 rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-indigo-500" />
              <h2 class="text-base font-semibold text-slate-900 dark:text-white">
                {{ highlight.title }}
              </h2>
              <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {{ highlight.description }}
              </p>
            </article>
          </div>
        </div>
      </section>

      <div class="relative mx-auto w-full lg:max-w-none" :class="cardWidthClass">
        <div class="mb-6 text-center lg:hidden">
          <img src="/capgo.webp" alt="Capgo logo" class="mx-auto mb-4 h-12 w-12 rounded-sm invert dark:invert-0">
          <p class="text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase dark:text-slate-300">
            {{ heroKickerValue }}
          </p>
          <h1 class="mt-4 text-3xl font-semibold leading-tight text-slate-950 dark:text-white sm:text-4xl">
            {{ heroTitleValue }}
          </h1>
          <p class="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
            {{ heroDescriptionValue }}
          </p>
        </div>

        <div class="rounded-[1.75rem] border border-slate-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(255,255,255,0.84)_100%)] p-6 backdrop-blur-[18px] shadow-[0_34px_80px_-42px_rgba(15,23,42,0.5)] dark:border-slate-600/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88)_0%,rgba(15,23,42,0.7)_100%)] sm:p-7">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p v-if="cardKicker" class="text-[0.72rem] font-bold tracking-[0.22em] text-slate-500 uppercase dark:text-slate-400">
                {{ cardKicker }}
              </p>
              <h2 class="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
                {{ cardTitle }}
              </h2>
              <p v-if="cardDescription" class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-300">
                {{ cardDescription }}
              </p>
            </div>
            <span
              v-if="badgeText"
              class="self-start rounded-full border border-slate-300/90 bg-slate-50/95 px-3.5 py-2 text-[0.78rem] font-semibold text-slate-600 dark:border-slate-600/90 dark:bg-slate-800/90 dark:text-slate-200"
            >
              {{ badgeText }}
            </span>
          </div>

          <div class="mt-6 text-slate-500 dark:text-slate-300">
            <slot />
          </div>
        </div>

        <slot name="footer" />
      </div>
    </div>
  </section>
</template>
