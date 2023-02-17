import type { FunctionalComponent } from 'vue'

export type MobileColType = 'header' | 'title' | 'footer' | 'after'

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
  onClick?: (elem: any) => void
}

export interface Tab {
  label: string
  icon?: FunctionalComponent
  key: string
}
