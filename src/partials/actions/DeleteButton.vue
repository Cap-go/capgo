<template>
  <div :class="selectedItems.length < 1 && 'hidden'">
    <div class="flex items-center">
      <div class="hidden xl:block text-sm italic mr-2 whitespace-nowrap"><span>{{selectedItems.length}}</span> items selected</div>
      <button class="btn bg-white border-slate-200 hover:border-slate-300 text-rose-500 hover:text-rose-600">Delete</button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DeleteButton',
  props: ['selectedItems'],
}
</script>