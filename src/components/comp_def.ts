import type { FunctionalComponent, Ref, ShallowRef } from 'vue'
import type { ComposerTranslation } from 'vue-i18n'

export type MobileColType = 'header' | 'title' | 'footer' | 'after' | 'none'

export interface Stat {
  label: string | ComposerTranslation
  value: string | number | Ref<number> | undefined
  link?: string
}
export interface TableSort {
  [key: string]: 'asc' | 'desc' | null
}
export interface TableColumn {
  label: string
  key: string
  mobile: MobileColType
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
}
