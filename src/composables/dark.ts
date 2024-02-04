import { useToggle } from '@vueuse/core'
import { ref } from 'vue'

const isDark = ref(true)
const toggleDark = useToggle(isDark)

export {
  isDark,
  toggleDark,
}
