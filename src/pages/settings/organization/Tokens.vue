<script setup lang="ts">
import type { CategoryScale, Chart, ChartData, ChartOptions, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import type { Database } from '~/types/supabase.types'
import dayjs from 'dayjs'
import { useI18n } from 'petite-vue-i18n'
import { Line } from 'vue-chartjs'
import { useRouter } from 'vue-router'
import ArrowDown from '~icons/heroicons/arrow-down'
import IconBack from '~icons/heroicons/arrow-uturn-left'
import BookOpen from '~icons/heroicons/book-open'
import ShoppingCartIcon from '~icons/heroicons/shopping-cart'
import IcBaselineInfo from '~icons/ic/baseline-info'
import BlurBg from '~/components/BlurBg.vue'
import BuyTokens from '~/components/BuyTokens.vue'
import { openCheckoutForOneOff } from '~/services/stripe'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'
import CurrencyIcon from '../../../../assets/mau.svg'

// Hiragino Sans Bold is the font for the icon of MAU
const pageType = 'mau'

const { t } = useI18n()
const historyExpanded = ref(true)
const buyTokensExpanded = ref(true)
const calculatorOpen = ref(false)
const tokensToBuy = ref(0)
const organizationStore = useOrganizationStore()
const supabase = useSupabase()
const tokensHistory = ref<Database['public']['Functions']['get_tokens_history']['Returns']>([])
const tokensSteps = ref<Database['public']['Tables']['capgo_tokens_steps']['Row'][]>([])
const router = useRouter()
const historyPage = ref(false)
const expandedHashset = ref<Set<string>>(new Set())
const displayStore = useDisplayStore()

const totalTokens = computed(() => {
  return tokensHistory.value.reduce((acc, token) => acc + token.sum, 0)
})

const thankYouPage = ref(router.currentRoute.value.query.thankYou === 'true')

const computedPrice = computed(() => {
  return computePrice(tokensToBuy.value)
})
const computedPriceUp = computed(() => {
  return Math.ceil(computedPrice.value)
})

Chart.register(
  Tooltip,
  PointElement,
  CategoryScale,
  LinearScale,
  LineElement,
)

function getLast30Days() {
  const dates = []
  const endDate = new Date()
  for (let i = 29; i >= 0; i--) {
    const date = new Date(endDate)
    date.setDate(endDate.getDate() - i)
    dates.push(date.toISOString().slice(0, 10))
  }
  return dates
}

const chartData = ref<ChartData<'line'>>({
  labels: getLast30Days(),
  datasets: [{
    label: 'Tokens',
    data: [],
    borderColor: '#f8b324',
    backgroundColor: 'rgba(248, 179, 36, 0.2)',
    tension: 0.3,
    pointRadius: 3,
    pointBorderWidth: 2,
    pointBackgroundColor: 'white',
    pointBorderColor: '#f8b324',
  }],
})

watch(tokensHistory, () => {
  const oneYearAgo = new Date()
  const today = new Date(+oneYearAgo)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const data = []
  let lastToken = 0

  const tokensChanges = tokensHistory.value.map((token) => {
    return {
      date: new Date(token.created_at),
      change: token.sum,
    }
  })

  // Iterate through each day
  for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
    const change = tokensChanges
      .filter(token => token.date.getDate() === d.getDate() && token.date.getMonth() === d.getMonth() && token.date.getFullYear() === d.getFullYear())
      .reduce((acc, token) => acc + token.change, 0)
    if (change) {
      lastToken += change
    }
    data.push(lastToken)
  }

  // Update chart labels with all dates
  chartData.value = {
    ...chartData.value,
    datasets: [{
      ...chartData.value.datasets[0],
      data: data.slice(-30),
    }],
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: isDark.value ? 'white' : 'black' },
    },
    y: {
      ticks: {
        color: isDark.value ? 'white' : 'black',
      },
    },
  },
  plugins: {
    legend: { display: false },
    title: { display: false },
  },
}))

async function loadData() {
  await organizationStore.fetchOrganizations()
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId) {
    return
  }
  const [tokensHistoryValue, tokensStepsValue] = await Promise.all([
    supabase.rpc('get_tokens_history', { orgid: orgId }),
    supabase.from('capgo_tokens_steps').select('*').order('step_min', { ascending: true }),
  ])
  if (tokensHistoryValue.error) {
    console.error('tokensHistory.error', tokensHistoryValue.error)
    return
  }
  if (tokensStepsValue.error) {
    console.error('tokensSteps.error', tokensStepsValue.error)
    return
  }
  tokensHistory.value = tokensHistoryValue.data
  tokensSteps.value = tokensStepsValue.data
}

onMounted(async () => {
  await loadData()
})

watch(thankYouPage, async () => {
  await loadData()
})

watch(tokensHistory, async () => {
  expandedHashset.value = new Set()
})

function computePrice(howMany: number) {
  if (howMany > 0 && tokensSteps.value && tokensSteps.value.length > 0) {
    let i = 0
    let price = 0

    while (true) {
      const step = tokensSteps.value[i]
      price += step.price_per_unit * (Math.min(howMany, step.step_max) - Math.max(0, step.step_min))
      if (howMany >= step.step_min && howMany <= step.step_max) {
        break
      }
      i++
    }
    return price
  }
  else {
    return 0
  }
}

function computeTokens(euros: number): number {
  if (euros <= 0 || !tokensSteps.value || tokensSteps.value.length === 0) {
    return 0
  }

  let remainingEuros = euros
  let totalTokens = 0
  let i = 0

  while (remainingEuros > 0 && i < tokensSteps.value.length) {
    const step = tokensSteps.value[i]
    const tokensInStep = step.step_max - step.step_min
    const costForStep = tokensInStep * step.price_per_unit

    if (remainingEuros >= costForStep) {
      // Can buy all tokens in this step
      totalTokens += tokensInStep
      remainingEuros -= costForStep
      i++
    }
    else {
      // Can only buy some tokens in this step
      const tokensCanBuy = Math.floor(remainingEuros / step.price_per_unit)
      totalTokens += tokensCanBuy
      break
    }
  }

  return totalTokens
}

async function buyTokens(howMany: number) {
  const orgId = organizationStore.currentOrganization!.gid
  if (!orgId) {
    return
  }
  if (howMany < 1) {
    return
  }
  openCheckoutForOneOff('', 'https://capgo.app', 'https://capgo.app', orgId, howMany)
}

function toMilion(price: number) {
  return `${price / 1000000}M`
}

function formatTokens(tokens: number) {
  return tokens % 1000000 === 0 && tokens !== 0 ? toMilion(tokens) : tokens % 1000 === 0 && tokens !== 0 ? `${tokens / 1000}K` : `${tokens}`
}

function explainTokens() {
  displayStore.dialogOption = {
    header: t(`tokens-explanation-${pageType}`),
    message: t(`tokens-explanation-message-${pageType}`),
    textStyle: 'mb-2',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
    ],
  }
  displayStore.showDialog = true
}
</script>

<template>
  <div v-if="!thankYouPage && !historyPage" class="h-full pb-8 overflow-y-auto grow md:pb-0">
    <div class="px-4 pt-6 mx-autolg:px-8 sm:px-6">
      <div class="sm:align-center flex flex-col">
        <h1 class="text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
          {{ t(`capgo-tokens-${pageType}`) }}
        </h1>
        <div class="flex flex-row items-center justify-center mt-5">
          <p class="text-xl text-gray-700 sm:text-center dark:text-white">
            {{ t(`manage-your`) }} {{ t(`capgo-tokens-${pageType}`) }} {{ t(`here`) }}
          </p>
          <button @click="() => { explainTokens() }">
            <IcBaselineInfo class="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
      <div class="flex items-center justify-center mt-12 space-x-6">
        <BlurBg background="linear-gradient(90deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%)" rotate>
          <div class="flex items-center justify-center p-5">
            <CurrencyIcon class="w-32 h-32" />
            <h1 class="ml-7 text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
              {{ formatTokens(totalTokens) }}
            </h1>
          </div>
        </BlurBg>
      </div>
      <div class="flex flex-col xl:flex-row mt-12 space-x-24 pb-10">
        <div class="w-full flex flex-col">
          <div class="w-full bg-base-100 rounded-tr-4xl rounded-tl-4xl h-6">
            <h5 class="text-center">
              {{ t(`tokens-key-${pageType}`) }} {{ t(`history`) }}
            </h5>
          </div>
          <div class="w-full bg-gray-700  rounded-br-4xl rounded-bl-4xl " @click.capture="() => { if (!historyExpanded) historyExpanded = !historyExpanded }">
            <ArrowDown v-if="!historyExpanded" class="mx-auto" />
            <div v-else class="flex flex-col h-[32rem]">
              <div class="w-[90%] h-96 mt-[1rem] mx-auto">
                <Line :data="chartData" :options="chartOptions" />
              </div>
              <button class="w-48 h-8 mt-4 text-gray-900 rounded-full mx-auto bg-[#f8b324]" @click="() => { historyPage = true }">
                <div class="flex items-center justify-center">
                  {{ t('show-full-history') }}
                  <BookOpen class="w-4 h-4 ml-2" />
                </div>
              </button>
              <div class="flex-grow" />
              <button @click="() => { historyExpanded = false }">
                <ArrowDown v-if="historyExpanded" class="mx-auto rotate-180 mb-4 bg-gray-700" />
              </button>
            </div>
          </div>
        </div>
        <div class="w-full flex flex-col">
          <div class="w-full bg-base-100 rounded-tr-4xl rounded-tl-4xl h-6">
            <h5 class="text-center">
              {{ t('buy') }} {{ t(`tokens-key-${pageType}`) }}
            </h5>
          </div>
          <div class="w-full bg-gray-700  rounded-br-4xl rounded-bl-4xl " @click.capture="() => { if (!buyTokensExpanded) buyTokensExpanded = !buyTokensExpanded }">
            <ArrowDown v-if="!buyTokensExpanded" class="mx-auto" />
            <div v-else class="flex flex-col h-[32rem]">
              <div class="w-[90%] h-[27rem] mt-[1rem] flex flex-row mx-auto">
                <template v-if="!calculatorOpen">
                  <div class="w-1/2 h-full mr-3">
                    <div class="flex flex-col h-full w-full">
                      <div class="w-full h-full mb-3">
                        <BuyTokens :price="computePrice(10)" :amount="10" :custom="false" :icon="CurrencyIcon" @click="() => { buyTokens(10) }" />
                      </div>
                      <div class="w-full h-full mt-3">
                        <BuyTokens :price="computePrice(30)" :amount="30" :custom="false" :icon="CurrencyIcon" @click="() => { buyTokens(30) }" />
                      </div>
                    </div>
                  </div>
                  <div class="w-1/2 h-full ml-3">
                    <div class="flex flex-col h-full w-full">
                      <div class="w-full h-full mb-3">
                        <BuyTokens :price="computePrice(50)" :amount="50" :custom="false" :icon="CurrencyIcon" @click="() => { buyTokens(50) }" />
                      </div>
                      <div class="w-full h-full mt-3">
                        <BuyTokens :price="computePrice(0)" :amount="0" :custom="true" :icon="CurrencyIcon" @click="() => { calculatorOpen = true }" />
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="w-full h-full flex flex-col">
                    <div class="w-full h-fit max-w-full flex flex-row items-center justify-center">
                      <h1 class="2xl:text-3xl text-xl">
                        {{ t('buy-any-amount') }}
                      </h1>
                      <CurrencyIcon class="ml-2 w-[40px] h-[40px]" />
                    </div>
                    <div class="w-full flex-1 flex flex-col mt-4">
                      <div class="w-full h-fit flex flex-col items-center">
                        <h2 class="text-base 2xl:text-lg font-semibold text-center">
                          {{ t('how-many-tokens') }}
                        </h2>
                        <input v-model="tokensToBuy" type="number" min="1" step="1" class="mt-2 bg-gray-700 rounded-full text-center text-white" @input="tokensToBuy = Math.max(1, Math.floor(Math.abs(tokensToBuy)))">
                      </div>
                      <div class="my-[9px] w-[70%] h-[3px] bg-base-100 mx-auto" />
                      <div class="w-full h-full flex flex-row">
                        <div class="w-full h-full mt-2 flex flex-col items-center">
                          <h2 class="text-base 2xl:text-lg font-semibold text-center">
                            {{ t('tokens-cost') }} {{ computedPriceUp }}$
                          </h2>
                          <div class="flex flex-row justify-center items-center">
                            <h2 class="text-base 2xl:text-lg font-semibold text-center">
                              {{ t(`it-will-increase-your-${pageType}-by`) }} {{ computeTokens(computedPriceUp) }}
                            </h2>
                            <CurrencyIcon class="ml-2 w-[30px] h-[30px]" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center justify-center h-fit">
                      <button class="w-24 h-8 mt-4 text-gray-900 rounded-full mx-auto bg-[#f8b324] transform transition-transform hover:scale-120" @click="() => { historyPage = true }">
                        <div class="flex items-center justify-center">
                          {{ t('buy') }}
                          <ShoppingCartIcon class="w-4 h-4 ml-2" />
                        </div>
                      </button>
                    </div>
                  </div>
                </template>
              </div>
              <div class="flex-grow" />
              <div class="w-full h-fit gap-x-3 flex flex-row items-center justify-center">
                <button v-if="calculatorOpen" @click="() => { calculatorOpen = false }">
                  <IconBack v-if="calculatorOpen" class="rotate-180 mb-4 bg-gray-700" />
                </button>
                <button @click="() => { buyTokensExpanded = false; calculatorOpen = false }">
                  <ArrowDown v-if="buyTokensExpanded" class="rotate-180 mb-4 bg-gray-700" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="thankYouPage" class="relative w-full overflow-hidden ">
    <div class="absolute z-10 right-0 left-0 ml-auto mt-[5vh] text-2xl mr-auto text-center w-fit flex flex-col">
      <img src="/capgo.webp" alt="logo" class="h-[4rem]  w-[4rem] ml-auto mr-auto mb-[4rem]">
      {{ t('thank-you-for-money') }}
      <span class=" mt-[2.5vh] text-[3.5rem]">🎉</span>
      <router-link class="mt-[39.2vh]" to="/app/home">
        <span class="text-xl text-blue-600">{{ t('use-capgo') }} 🚀</span>
      </router-link>
      <button class="mx-auto mt-2" @click="() => { thankYouPage = false }">
        <IconBack class="rotate-180 mb-2" />
      </button>
    </div>
  </div>
  <div v-else-if="historyPage" class="w-full h-full">
    <div class="px-4 pt-6 mx-autolg:px-8 sm:px-6 flex flex-col items-center h-full">
      <div class="sm:align-center sm:flex md:flex-col mb-2">
        <h1 class="text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
          {{ t(`capgo-tokens-${pageType}-history`) }}
        </h1>
        <p class="mt-5 text-xl text-gray-700 sm:text-center dark:text-white">
          {{ t(`see-your`) }} {{ t(`tokens-key-${pageType}`) }} {{ t(`history`) }}<br>
        </p>
      </div>
      <div class="w-full h-full flex flex-col items-center bg-base-100 rounded-4xl border-12 border-base-100 py-2 max-w-[38rem] overflow-y-auto">
        <ol v-if="tokensHistory.length > 0" class="w-full">
          <li v-for="token in tokensHistory.toReversed()" :key="token.id">
            <div
              class="flex flex-column justify-between bg-gray-800 mx-4 rounded-2xl mb-2" :class="{ 'h-14': !expandedHashset.has(token.id.toString()), 'h-24': expandedHashset.has(token.id.toString()) }" @click="() => {
                if (expandedHashset.has(token.id.toString())) { expandedHashset.delete(token.id.toString()) }
                else { expandedHashset.add(token.id.toString()) }
              }"
            >
              <div class="flex flex-col w-full">
                <div class="flex flex-row w-full h-14 justify-between">
                  <div class="flex items-center h-14">
                    <h2 class="ml-2 text-base 2xl:text-lg font-semibold text-center" :class="[token.sum > 0 ? 'text-green-500' : 'text-red-500']">
                      {{ token.sum > 0 ? '+' : '' }}{{ formatTokens(token.sum) }}
                    </h2>
                  </div>
                  <div class="flex items-center h-14">
                    <h2 class="mx-auto text-base 2xl:text-lg font-semibold text-center">
                      {{ token.reason }}
                    </h2>
                  </div>
                  <div class="flex items-center h-14">
                    <h2 class="mr-2 text-base 2xl:text-lg font-semibold text-center">
                      {{ dayjs(token.created_at).format('DD/MM/YYYY') }}
                    </h2>
                  </div>
                </div>
                <div v-if="expandedHashset.has(token.id.toString())" class="flex flex-col w-full h-10 justify-between">
                  <div class="flex flex-row items-center h-10">
                    <h2 class="ml-2 text-base 2xl:text-lg font-semibold text-center">
                      {{ t('total-tokens') }}: {{ formatTokens(token.running_total) }}
                    </h2>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ol>
        <div v-else class="w-full h-full flex flex-col items-center justify-center">
          <h1 class="text-2xl font-bold text-gray-900 sm:text-center dark:text-white">
            {{ t('no-tokens-history') }}
          </h1>
        </div>
      </div>
      <button class="mx-auto mt-4 mb-2" @click="() => { historyPage = false }">
        <IconBack class="rotate-180 mb-2" />
      </button>
    </div>
  </div>
  <div v-else />
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
