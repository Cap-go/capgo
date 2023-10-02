import { useDark, useToggle } from '@vueuse/core'

const isDark = true
const toggleDark = useToggle(isDark)

export {
  isDark,
  toggleDark,
}
