import type { ComposerTranslation } from 'petite-vue-i18n'
import type { FunctionalComponent, Ref, ShallowRef } from 'vue'

export type MobileColType = 'header' | 'title' | 'footer' | 'after' | 'none'

export interface Stat {
  label: string | ComposerTranslation
  value: string | Ref<string> | number | Ref<number> | undefined
  link?: string
  hoverLabel?: string
  informationIcon?: FunctionalComponent | ShallowRef<FunctionalComponent<any>>
}
export interface TableSort {
  [key: string]: 'asc' | 'desc' | null
}
export interface TableColumn {
  label: string
  key: string
  mobile?: boolean
  sortable?: boolean | 'asc' | 'desc'
  head?: boolean
  icon?: FunctionalComponent | ShallowRef<FunctionalComponent<any>>
  class?: string
  allowHtml?: boolean
  displayFunction?: (item: any) => string | any
  onClick?: (item: any) => void
}

export interface Tab {
  label: string
  icon?: FunctionalComponent | ShallowRef<FunctionalComponent<any>>
  key: string
  onClick?: (elem: any | undefined) => void
  redirect?: boolean
}
