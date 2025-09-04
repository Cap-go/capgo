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

/**
 * Defines a single action button configuration.
 */
export interface TableAction {
  icon: FunctionalComponent | ShallowRef<FunctionalComponent<any>>
  onClick: (item: any) => void
  visible?: (item: any) => boolean
  disabled?: (item: any) => boolean
}

export interface TableColumn {
  label: string
  key: string
  mobile?: boolean
  sortable?: boolean | 'asc' | 'desc'
  head?: boolean
  icon?: FunctionalComponent | ShallowRef<FunctionalComponent<any>>
  onClick?: (item: any) => void
  actions?: TableAction[] // New property for multiple actions
  class?: string
  allowHtml?: boolean
  sanitizeHtml?: boolean
  displayFunction?: (item: any) => string | number
}

export interface Tab {
  label: string
  icon?: FunctionalComponent | ShallowRef<FunctionalComponent<any>>
  key: string
  onClick?: (elem: any | undefined) => void
  redirect?: boolean
}
