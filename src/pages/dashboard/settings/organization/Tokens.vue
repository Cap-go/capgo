<script setup lang="ts">
import CurrencyIcon from '../../../../assets/mau.svg'
import { useI18n } from 'petite-vue-i18n'
import BlurBg from '~/components/BlurBg.vue'
import ArrowDown from '~icons/heroicons/arrow-down'
import BookOpen from '~icons/heroicons/book-open'
import { Line } from 'vue-chartjs'
import { ChartData, ChartOptions } from 'chart.js'
import { CategoryScale, Chart, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import BuyTokens from '~/components/BuyTokens.vue'
import ShoppingCartIcon from '~icons/heroicons/shopping-cart'
import IconBack from '~icons/heroicons/arrow-uturn-left'
import { useOrganizationStore } from '~/stores/organization'
import { useSupabase } from '~/services/supabase'
import { Database } from '~/types/supabase.types'
import { openCheckoutForOneOff } from '~/services/stripe'

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
const totalTokens = computed(() => {
  return tokensHistory.value.reduce((acc, token) => acc + token.sum, 0)
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
  }]
})

watch(tokensHistory, () => {
  const oneYearAgo = new Date()
  const today = new Date(+oneYearAgo)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const data = []
  let lastToken = 0

  const tokensChanges = tokensHistory.value.map(token => {
    return {
      date: new Date(token.created_at),
      change: token.sum
    }
  })
  
  // Iterate through each day
  for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
    const change = tokensChanges.find(token => token.date.getDate() === d.getDate() && token.date.getMonth() === d.getMonth() && token.date.getFullYear() === d.getFullYear())
    if (change) {
      lastToken += change.change
    }
    data.push(lastToken)
  }
  
  // Update chart labels with all dates
  chartData.value = {
    ...chartData.value,
    datasets: [{
      ...chartData.value.datasets[0],
      data: data.slice(-30),
    }]
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

onMounted(async () => {
  await organizationStore.fetchOrganizations()
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId) {
    return
  }
  const [tokensHistoryValue, tokensStepsValue] = await Promise.all([
    supabase.rpc('get_tokens_history', { orgid: orgId }),
    supabase.from('capgo_tokens_steps').select('*').order('step_min', { ascending: true })
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
  } else {
    return 0
  }
}

async function buyTokens(howMany: number) {
  const orgId = organizationStore.currentOrganization!.gid
  if (!orgId) {
    return
  }
  if (howMany < 1) {
    return
  }
  openCheckoutForOneOff("", 'https://capgo.app', 'https://capgo.app', orgId, howMany)
}

</script>
<template>
  <div class="h-full pb-8 overflow-y-auto grow md:pb-0">
    <div class="px-4 pt-6 mx-autolg:px-8 sm:px-6">
        <div class="sm:align-center sm:flex md:flex-col">
          <h1 class="text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
            {{ t(`capgo-tokens-${pageType}`) }}
          </h1>
          <p class="mt-5 text-xl text-gray-700 sm:text-center dark:text-white">
          {{ t(`manage-your`) }} {{ t(`capgo-tokens-${pageType}`) }} {{ t(`here`) }}<br>
        </p>
      </div>
      <div class="flex items-center justify-center mt-12 space-x-6">
        <BlurBg background="linear-gradient(90deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%)" rotate>
          <div class="flex items-center justify-center p-5">
            <CurrencyIcon class="w-32 h-32" />
            <h1 class="ml-7 text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
              {{ totalTokens }}
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
            <ArrowDown v-if="!historyExpanded" class="mx-auto"></ArrowDown>
            <div v-else class="flex flex-col h-[32rem]">
              <div class="w-[90%] h-96 mt-[1rem] mx-auto">
                <Line :data="chartData" :options="chartOptions"></Line>
              </div>
              <button class="w-48 h-8 mt-4 text-gray-900 rounded-full mx-auto bg-[#f8b324]">
                <div class="flex items-center justify-center">
                  {{ t('show-full-history') }}
                  <BookOpen class="w-4 h-4 ml-2" />
                </div>
              </button>
              <div class="flex-grow"></div>
              <button @click="() => { historyExpanded = false }">
                <ArrowDown v-if="historyExpanded" class="mx-auto rotate-180 mb-4 bg-gray-700"></ArrowDown>
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
            <ArrowDown v-if="!buyTokensExpanded" class="mx-auto"></ArrowDown>
            <div v-else class="flex flex-col h-[32rem]">
              <div class="w-[90%] h-[26rem] mt-[1rem] flex flex-row mx-auto">
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
                      <h1 class="2xl:text-3xl text-xl"> {{ t('buy-any-amount') }} </h1>
                      <CurrencyIcon class="ml-2 w-[40px] h-[40px]" />
                    </div>
                    <div class="w-full flex-1 flex flex-col mt-4">
                      <div class="w-full h-fit flex flex-col items-center">
                        <h2 class="text-sm 2xl:text-base font-semibold text-center">
                          {{ t('how-many-tokens') }}
                        </h2>
                      <input v-model="tokensToBuy" type="number" min="1" step="1" @input="tokensToBuy = Math.max(1, Math.floor(Math.abs(tokensToBuy)))" class="mt-2 bg-gray-700 rounded-full text-center text-white" />
                        <div class="w-full flex flex-row items-center justify-center">
                          <h2 class="mt-2 text-sm 2xl:text-base font-semibold text-center">
                            {{ t('tokens-cost') }} {{ computePrice(tokensToBuy) }}$
                          </h2>
                        </div>
                      </div>
                      <div class="my-[9px] w-[70%] h-[3px] bg-base-100 mx-auto"></div>
                      <div class="w-full h-full flex flex-col">
                        <h2 class="text-sm 2xl:text-base font-semibold text-center">
                          {{ t('this-will-allow-you-to') }}
                        </h2>
                        <ul class="mt-3 list-disc list-inside text-sm text-center">
                          <li>
                            {{ t('increase-mau-limit-by') }} {{ tokensToBuy * 1000 }}
                          </li>
                          <h3 class="text-xs text-center">
                            {{ t('or') }}
                          </h3>
                          <li>
                            {{ t('increase-storage-limit-by') }} {{ tokensToBuy * 10 }}{{ t('gb') }}
                          </li>
                          <h3 class="text-xs text-center">
                            {{ t('or') }}
                          </h3>
                          <li>
                            {{ t('increase-bandwidth-limit-by') }} {{ tokensToBuy * 15 }}{{ t('gb') }}
                          </li>
                        </ul>
                      </div>
                    </div>
                    <div class="w-full h-full flex flex-col"></div>
                    <div class="flex items-center justify-center h-fit">
                      <button class="bg-[#f8b324] text-white p-3 rounded-full aspect-square transform transition-transform hover:scale-120" @click="() => { buyTokens(tokensToBuy) }">
                        <ShoppingCartIcon class="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                </template>
              </div>
              <div class="flex-grow"></div>
              <div class="w-full h-fit gap-x-3 flex flex-row items-center justify-center">
                <button v-if="calculatorOpen" @click="() => { calculatorOpen = false }">
                  <IconBack v-if="calculatorOpen" class="rotate-180 mb-4 bg-gray-700"></IconBack>
                </button>
                <button @click="() => { buyTokensExpanded = false; calculatorOpen = false }">
                  <ArrowDown v-if="buyTokensExpanded" class="rotate-180 mb-4 bg-gray-700"></ArrowDown>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
