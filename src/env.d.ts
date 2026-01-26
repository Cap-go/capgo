/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_RBAC_SYSTEM?: string
}

// Type declarations for chartjs-chart-funnel (no official types available)
declare module 'chartjs-chart-funnel' {
  import type { ChartComponentLike } from 'chart.js'

  export const FunnelController: ChartComponentLike
  export const TrapezoidElement: ChartComponentLike
}
