<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ShoppingCartIcon from '~icons/heroicons/shopping-cart'
import CalculatorIcon from '~icons/heroicons/calculator'

const props = defineProps<{
  price: number,
  amount: number,
  custom: boolean
  icon: string
}>()

defineEmits<{
  (e: 'click'): void
}>()

const { t } = useI18n();
</script>

<template>
  <div class="w-full h-full bg-base-100 flex flex-col rounded-lg">
    <div class="flex flex-col mt-[10%]">
      <div class="flex items-center justify-center h-fit">
        <h1 class="text-3xl">
          {{ t('buy') }} {{ !custom ? amount : t('custom').toLocaleLowerCase() }}
        </h1>
        <component :is="props.icon" class="ml-1 w-6 h-6" />
      </div>
      <div v-if="!custom" class="flex items-center justify-center h-fit">
        <h2 class="text-xl">
          {{ t('for') }} {{ price }}$
        </h2>
      </div>
    </div>
    <div class="flex-grow"></div>
    <div class="flex items-center justify-center h-fit mb-[10%]">
      <button @click="$emit('click')" class="bg-[#f8b324] text-white p-3 rounded-full aspect-square transform transition-transform hover:scale-120">
        <CalculatorIcon v-if="custom" class="w-6 h-6 text-black" />
        <ShoppingCartIcon v-else class="w-6 h-6 text-black" />
      </button>
    </div>
  </div>
</template>
