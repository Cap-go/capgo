<script setup lang="ts">
import type { AssistantAction, AssistantCard, AssistantTurn, ChatGptStatus } from '~/services/assistant'
import { onKeyStroke, useLocalStorage } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import IconArrowRight from '~icons/heroicons/arrow-right'
import IconArrowUp from '~icons/heroicons/arrow-up'
import IconChatBubble from '~icons/heroicons/chat-bubble-left-right'
import IconCheckCircle from '~icons/heroicons/check-circle'
import IconExclamationTriangle from '~icons/heroicons/exclamation-triangle'
import IconLinkSlash from '~icons/heroicons/link-slash'
import IconQuestion from '~icons/heroicons/question-mark-circle'
import IconSparkles from '~icons/heroicons/sparkles'
import IconTrash from '~icons/heroicons/trash'
import IconClose from '~icons/heroicons/x-mark'
import chatGptLogoWhite from '~/assets/assistant/chatgpt-logo-white.svg'
import { askAssistant, ASSISTANT_OPEN_AFTER_CONNECT_KEY, AssistantChatGptError, AssistantKeyError, assistantKeyStorageKey, CHATGPT_MANAGE_USAGE_URL, createAssistantKey, disconnectChatGpt, getChatGptStatus, startChatGptConnect } from '~/services/assistant'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import { tokenizeAssistantText } from '~/utils/assistantText'

interface ChatEntry extends AssistantTurn {
  id: number
  cards: AssistantCard[]
  actions: AssistantAction[]
  error?: boolean
  /** ChatGPT plan limit reached: shown as the "Usage limit reached" card from OpenAI's guidelines. */
  usageLimit?: boolean
  /** Question / confirm cards stay clickable until the user answers once. */
  answered?: boolean
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const supabase = useSupabase()
const main = useMainStore()
const organizationStore = useOrganizationStore()

const open = ref(false)
const input = ref('')
const loading = ref(false)
const connecting = ref(false)
const connectError = ref('')
const entries = ref<ChatEntry[]>([])
const chatgpt = ref<ChatGptStatus | null>(null)
const showWelcome = ref(false)
const welcomeSeen = useLocalStorage('capgo-assistant-chatgpt-welcome-seen', false)
const scroller = useTemplateRef<HTMLElement>('scroller')
const inputEl = useTemplateRef<HTMLTextAreaElement>('inputEl')
let nextId = 1

const userId = computed(() => main.user?.id ?? main.auth?.id ?? '')
const storedKey = useLocalStorage<Record<string, string>>('capgo-assistant-keys', {})
const apikey = computed(() => (userId.value ? storedKey.value[assistantKeyStorageKey(userId.value)] ?? '' : ''))

/** ChatGPT is the model provider when the server has a Sign in with ChatGPT client configured. */
const needsChatGpt = computed(() => !!chatgpt.value?.configured && !chatgpt.value.connected)
const needsConnect = computed(() => !apikey.value || needsChatGpt.value)

const suggestions = computed(() => [
  t('assistant-suggestion-where'),
  t('assistant-suggestion-latest'),
  t('assistant-suggestion-devices'),
])

const pageContext = computed(() => {
  const appParam = 'app' in route.params ? route.params.app : undefined
  const org = organizationStore.currentOrganization
  return {
    path: route.fullPath,
    orgId: org?.gid,
    orgName: org?.name,
    appId: typeof appParam === 'string' ? appParam : undefined,
  }
})

function setKey(value: string) {
  const key = assistantKeyStorageKey(userId.value)
  const next = { ...storedKey.value }
  if (value)
    next[key] = value
  else
    delete next[key]
  storedKey.value = next
}

async function scrollToBottom() {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
}

async function refreshChatGpt() {
  chatgpt.value = await getChatGptStatus()
}

function toggle() {
  open.value = !open.value
  if (open.value)
    nextTick(() => inputEl.value?.focus())
}

onKeyStroke('j', (event) => {
  if (!(event.metaKey || event.ctrlKey))
    return
  event.preventDefault()
  toggle()
})
onKeyStroke('Escape', () => {
  if (open.value)
    open.value = false
})

async function connect() {
  if (!userId.value)
    return
  connecting.value = true
  connectError.value = ''
  try {
    // The Capgo API key lets the assistant run MCP tools; ChatGPT pays for the model.
    if (!apikey.value) {
      await organizationStore.awaitInitialLoad()
      setKey(await createAssistantKey(supabase, userId.value, organizationStore.organizations))
    }
    if (chatgpt.value?.configured && !chatgpt.value.connected)
      window.location.assign(await startChatGptConnect(route.fullPath))
  }
  catch (error) {
    console.error('Cannot connect the assistant', error)
    connectError.value = error instanceof AssistantKeyError ? t('assistant-connect-no-org') : t('assistant-connect-failed')
  }
  finally {
    connecting.value = false
  }
}

async function run(confirm?: { tool: string, arguments: Record<string, unknown> }) {
  loading.value = true
  await scrollToBottom()
  try {
    const history = entries.value.filter(entry => !entry.error).map(({ role, content }) => ({ role, content }))
    const response = await askAssistant(apikey.value, history, pageContext.value, confirm)
    entries.value.push({ id: nextId++, role: 'assistant', content: response.reply, cards: response.cards, actions: response.actions })
  }
  catch (error) {
    if (error instanceof AssistantKeyError) {
      setKey('')
      return
    }
    if (error instanceof AssistantChatGptError) {
      if (error.code === 'chatgpt_usage_limit') {
        entries.value.push({ id: nextId++, role: 'assistant', content: '', cards: [], actions: [], usageLimit: true })
        return
      }
      if (error.code !== 'chatgpt_not_eligible') {
        // Not connected, revoked in ChatGPT settings, or plan usage not granted: show "Continue with ChatGPT" again.
        connectError.value = t('assistant-chatgpt-reconnect')
        await refreshChatGpt()
        return
      }
      entries.value.push({ id: nextId++, role: 'assistant', content: t('assistant-chatgpt-not-eligible'), cards: [], actions: [], error: true })
      return
    }
    console.error('Assistant request failed', error)
    entries.value.push({ id: nextId++, role: 'assistant', content: t('assistant-error'), cards: [], actions: [], error: true })
  }
  finally {
    loading.value = false
    await scrollToBottom()
    inputEl.value?.focus()
  }
}

function send(text = input.value) {
  const content = text.trim()
  if (!content || loading.value)
    return
  input.value = ''
  entries.value.push({ id: nextId++, role: 'user', content, cards: [], actions: [] })
  run()
}

function answer(entry: ChatEntry, option: string) {
  entry.answered = true
  send(option)
}

function confirmAction(entry: ChatEntry, card: Extract<AssistantCard, { type: 'confirm' }>) {
  entry.answered = true
  entries.value.push({ id: nextId++, role: 'user', content: t('assistant-confirmed', { action: card.title }), cards: [], actions: [] })
  run({ tool: card.tool, arguments: card.arguments })
}

function cancelAction(entry: ChatEntry) {
  entry.answered = true
  send(t('assistant-cancelled'))
}

function go(path: string) {
  router.push(path)
  // Keep the chat open on large screens so the user can continue; close it on phones where it covers the page.
  if (window.innerWidth < 640)
    open.value = false
}

function onEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.isComposing)
    return
  event.preventDefault()
  send()
}

function clear() {
  entries.value = []
}

async function disconnect() {
  await disconnectChatGpt()
  await refreshChatGpt()
}

function dismissWelcome() {
  showWelcome.value = false
  welcomeSeen.value = true
}

watch(open, (value) => {
  if (!value)
    return
  scrollToBottom()
  if (!chatgpt.value)
    refreshChatGpt()
})

// Back from the ChatGPT consent screen: reopen the chat and explain plan usage once. The chat may
// stay mounted across the callback page, so check on every navigation, not only on mount.
async function resumeAfterConnect() {
  if (!sessionStorage.getItem(ASSISTANT_OPEN_AFTER_CONNECT_KEY))
    return
  sessionStorage.removeItem(ASSISTANT_OPEN_AFTER_CONNECT_KEY)
  await refreshChatGpt()
  open.value = true
  showWelcome.value = !welcomeSeen.value && !!chatgpt.value?.connected
}

watch(() => route.fullPath, resumeAfterConnect)
onMounted(resumeAfterConnect)
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-40 flex items-end justify-end p-3 sm:p-5" data-test="assistant-root">
    <section
      v-if="open"
      class="pointer-events-auto mb-16 flex h-[min(640px,calc(100dvh-7rem))] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-[420px] dark:border-slate-700 dark:bg-slate-800"
      role="dialog"
      :aria-label="t('assistant-title')"
      data-test="assistant-panel"
    >
      <header class="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-azure-500/10 text-azure-500">
          <IconSparkles class="h-4 w-4" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-semibold text-slate-900 dark:text-white">
            {{ t('assistant-title') }}
          </h2>
          <p class="truncate text-xs text-slate-500 dark:text-slate-400">
            {{ t('assistant-subtitle') }}
          </p>
        </div>
        <button
          v-if="chatgpt?.connected"
          type="button"
          class="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          :aria-label="t('assistant-chatgpt-disconnect')"
          :title="t('assistant-chatgpt-disconnect')"
          data-test="assistant-chatgpt-disconnect"
          @click="disconnect"
        >
          <IconLinkSlash class="h-4 w-4" />
        </button>
        <button
          v-if="entries.length"
          type="button"
          class="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          :aria-label="t('assistant-clear')"
          :title="t('assistant-clear')"
          @click="clear"
        >
          <IconTrash class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          :aria-label="t('close')"
          @click="open = false"
        >
          <IconClose class="h-5 w-5" />
        </button>
      </header>

      <!-- Connect: ChatGPT pays for the model, a revocable Capgo API key runs the MCP tools -->
      <div v-if="needsConnect" class="flex flex-1 flex-col justify-center gap-4 p-6" data-test="assistant-connect">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-azure-500/10 text-azure-500">
          <IconChatBubble class="h-6 w-6" />
        </div>
        <div>
          <h3 class="text-base font-semibold text-slate-900 dark:text-white">
            {{ chatgpt?.configured ? t('assistant-chatgpt-connect-title') : t('assistant-connect-title') }}
          </h3>
          <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {{ chatgpt?.configured ? t('assistant-chatgpt-connect-description') : t('assistant-connect-description') }}
          </p>
        </div>
        <p v-if="connectError" class="text-sm text-red-600 dark:text-red-400">
          {{ connectError }}
        </p>
        <button
          v-if="chatgpt?.configured"
          type="button"
          class="flex h-11 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
          :disabled="connecting"
          data-test="assistant-chatgpt-button"
          @click="connect"
        >
          <span v-if="connecting" class="d-loading d-loading-spinner d-loading-sm" />
          <img v-else :src="chatGptLogoWhite" alt="" class="h-5 w-5">
          {{ t('assistant-chatgpt-continue') }}
        </button>
        <button
          v-else
          type="button"
          class="d-btn d-btn-primary"
          :disabled="connecting || !chatgpt"
          data-test="assistant-connect-button"
          @click="connect"
        >
          <span v-if="connecting" class="d-loading d-loading-spinner d-loading-sm" />
          {{ t('assistant-connect-button') }}
        </button>
        <p v-if="chatgpt?.configured" class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('assistant-chatgpt-connect-note') }}
        </p>
      </div>

      <!-- First sign-in with plan usage (OpenAI UI guidelines) -->
      <div v-else-if="showWelcome" class="flex flex-1 flex-col justify-center gap-4 p-6" data-test="assistant-chatgpt-welcome">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-black">
          <img :src="chatGptLogoWhite" alt="" class="h-6 w-6">
        </div>
        <div>
          <h3 class="text-base font-semibold text-slate-900 dark:text-white">
            {{ t('assistant-chatgpt-welcome-title') }}
          </h3>
          <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {{ t('assistant-chatgpt-welcome-description') }}
          </p>
        </div>
        <button type="button" class="d-btn d-btn-primary" @click="dismissWelcome">
          {{ t('assistant-chatgpt-welcome-ok') }}
        </button>
      </div>

      <template v-else>
        <div ref="scroller" class="flex-1 space-y-4 overflow-y-auto px-4 py-4" data-test="assistant-messages">
          <div v-if="!entries.length" class="space-y-3">
            <p class="text-sm text-slate-600 dark:text-slate-300">
              {{ t('assistant-empty') }}
            </p>
            <button
              v-for="suggestion in suggestions"
              :key="suggestion"
              type="button"
              class="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:border-azure-500 hover:bg-azure-500/5 dark:border-slate-700 dark:text-slate-200"
              @click="send(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>

          <div v-for="entry in entries" :key="entry.id" class="flex flex-col gap-2" :class="entry.role === 'user' ? 'items-end' : 'items-start'">
            <div
              v-if="entry.actions.length"
              class="flex flex-wrap gap-1"
            >
              <span
                v-for="(action, index) in entry.actions"
                :key="index"
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                :class="action.ok ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'"
              >
                <IconCheckCircle v-if="action.ok" class="h-3 w-3" />
                <IconExclamationTriangle v-else class="h-3 w-3" />
                {{ action.title }}
              </span>
            </div>
            <div
              v-if="entry.usageLimit"
              class="w-[90%] rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-600 dark:bg-slate-800"
              data-test="assistant-usage-limit"
            >
              <p class="text-sm font-semibold text-slate-900 dark:text-white">
                {{ t('assistant-chatgpt-limit-title') }}
              </p>
              <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {{ t('assistant-chatgpt-limit-description') }}
              </p>
              <a :href="CHATGPT_MANAGE_USAGE_URL" target="_blank" rel="noopener" class="d-btn d-btn-sm d-btn-primary mt-2">
                {{ t('assistant-chatgpt-manage-usage') }}
              </a>
            </div>
            <div
              v-if="entry.content"
              class="max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
              :class="entry.role === 'user'
                ? 'bg-azure-500 text-white rounded-br-md'
                : entry.error
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200 rounded-bl-md'
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100 rounded-bl-md'"
            >
              <template v-for="(block, blockIndex) in tokenizeAssistantText(entry.content)" :key="blockIndex">
                <ul v-if="block.type === 'list'" class="my-1 list-disc space-y-0.5 pl-4">
                  <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
                    <template v-for="(span, spanIndex) in item" :key="spanIndex">
                      <strong v-if="span.style === 'bold'">{{ span.text }}</strong>
                      <code v-else-if="span.style === 'code'" class="rounded bg-black/10 px-1 font-mono text-[12px]">{{ span.text }}</code>
                      <template v-else>
                        {{ span.text }}
                      </template>
                    </template>
                  </li>
                </ul>
                <p v-else class="my-1 whitespace-pre-wrap">
                  <template v-for="(span, spanIndex) in block.spans" :key="spanIndex">
                    <strong v-if="span.style === 'bold'">{{ span.text }}</strong>
                    <code v-else-if="span.style === 'code'" class="rounded bg-black/10 px-1 font-mono text-[12px]">{{ span.text }}</code>
                    <template v-else>
                      {{ span.text }}
                    </template>
                  </template>
                </p>
              </template>
            </div>

            <template v-for="(card, cardIndex) in entry.cards" :key="cardIndex">
              <button
                v-if="card.type === 'link'"
                type="button"
                class="group flex w-[90%] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-azure-500 hover:shadow dark:border-slate-600 dark:bg-slate-800"
                data-test="assistant-link-card"
                @click="go(card.path)"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {{ card.title }}
                  </p>
                  <p v-if="card.description" class="truncate text-xs text-slate-500 dark:text-slate-400">
                    {{ card.description }}
                  </p>
                  <p class="truncate font-mono text-[11px] text-azure-500">
                    {{ card.path }}
                  </p>
                </div>
                <IconArrowRight class="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-azure-500" />
              </button>

              <div
                v-else-if="card.type === 'question'"
                class="w-[90%] rounded-xl border border-azure-500/40 bg-azure-500/5 p-3"
                data-test="assistant-question-card"
              >
                <p class="mb-2 flex items-start gap-2 text-sm font-medium text-slate-900 dark:text-white">
                  <IconQuestion class="mt-0.5 h-4 w-4 shrink-0 text-azure-500" />
                  {{ card.question }}
                </p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="option in card.options"
                    :key="option"
                    type="button"
                    class="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-azure-500 hover:text-azure-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    :disabled="entry.answered || loading"
                    @click="answer(entry, option)"
                  >
                    {{ option }}
                  </button>
                </div>
              </div>

              <div
                v-else-if="card.type === 'confirm'"
                class="w-[90%] rounded-xl border border-amber-400/60 bg-amber-50 p-3 dark:bg-amber-900/20"
                data-test="assistant-confirm-card"
              >
                <p class="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <IconExclamationTriangle class="h-4 w-4 text-amber-500" />
                  {{ card.title }}
                </p>
                <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {{ card.description }}
                </p>
                <pre class="mt-2 max-h-28 overflow-auto rounded-md bg-white/70 p-2 font-mono text-[11px] text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">{{ JSON.stringify(card.arguments, null, 1) }}</pre>
                <div class="mt-2 flex gap-2">
                  <button type="button" class="d-btn d-btn-sm d-btn-warning" :disabled="entry.answered || loading" @click="confirmAction(entry, card)">
                    {{ t('assistant-confirm') }}
                  </button>
                  <button type="button" class="d-btn d-btn-sm d-btn-ghost" :disabled="entry.answered || loading" @click="cancelAction(entry)">
                    {{ t('button-cancel') }}
                  </button>
                </div>
              </div>
            </template>
          </div>

          <div v-if="loading" class="flex items-center gap-2 text-xs text-slate-500" data-test="assistant-loading">
            <span class="d-loading d-loading-dots d-loading-sm" />
            {{ t('assistant-thinking') }}
          </div>
        </div>

        <form class="border-t border-slate-200 p-3 dark:border-slate-700" @submit.prevent="send()">
          <p v-if="chatgpt?.connected" class="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400" data-test="assistant-chatgpt-indicator">
            <img :src="chatGptLogoWhite" alt="" class="h-3.5 w-3.5 rounded-sm bg-black p-0.5">
            {{ t('assistant-chatgpt-using-plan') }}
            <span v-if="chatgpt.email" class="truncate">· {{ chatgpt.email }}</span>
            <a :href="CHATGPT_MANAGE_USAGE_URL" target="_blank" rel="noopener" class="ml-auto shrink-0 text-azure-500 hover:underline">
              {{ t('assistant-chatgpt-manage-usage') }}
            </a>
          </p>
          <div class="flex items-end gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-azure-500 dark:border-slate-600 dark:bg-slate-900">
            <textarea
              ref="inputEl"
              v-model="input"
              rows="1"
              class="max-h-32 flex-1 resize-none border-0 bg-transparent p-0 text-sm text-slate-900 placeholder-slate-400 focus:ring-0 focus:outline-none dark:text-white"
              :placeholder="t('assistant-placeholder')"
              data-test="assistant-input"
              @keydown.enter="onEnter"
            />
            <button
              type="submit"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-azure-500 text-white disabled:opacity-40"
              :disabled="!input.trim() || loading"
              :aria-label="t('assistant-send')"
            >
              <IconArrowUp class="h-4 w-4" />
            </button>
          </div>
        </form>
      </template>
    </section>

    <button
      type="button"
      class="pointer-events-auto absolute right-3 bottom-3 flex h-12 w-12 items-center justify-center rounded-full bg-dusk-500 text-white shadow-lg transition hover:scale-105 sm:right-5 sm:bottom-5 dark:bg-azure-500"
      :aria-label="t('assistant-open')"
      :title="`${t('assistant-open')} (⌘J)`"
      data-test="assistant-toggle"
      @click="toggle"
    >
      <IconClose v-if="open" class="h-5 w-5" />
      <IconSparkles v-else class="h-5 w-5" />
    </button>
  </div>
</template>
