import type { ComposerTranslation } from 'petite-vue-i18n'
import type { FunctionalComponent, Ref, ShallowRef } from 'vue'

export type MobileColType = 'header' | 'title' | 'footer' | 'after' | 'none'

export interface Stat {
  label: string | ComposerTranslation
  value: string | Ref<string> | number | Ref<number> | undefined
  link?: string
  hoverLabel?: string
  informationIcon?: FunctionalComponent
}
export interface TableSort {
  [key: string]: 'asc' | 'desc' | null
}
export interface TableColumn {
  label: string
  key: string
  mobile: boolean
  displayFunction?: (elem: any) => string
  sortable?: 'asc' | 'desc' | boolean
  head?: boolean
  class?: string
  icon?: FunctionalComponent
  onClick?: (elem: any | undefined) => void
}

export interface Tab {
  label: string
  icon?: FunctionalComponent | ShallowRef<FunctionalComponent<any>>
  key: string
  onClick?: (elem: any | undefined) => void
  redirect?: boolean
}
