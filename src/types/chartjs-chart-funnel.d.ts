declare module 'chartjs-chart-funnel' {

  export interface FunnelControllerDatasetOptions {
    data: number[]
    backgroundColor?: string | string[]
    borderColor?: string | string[]
    borderWidth?: number
    hoverBackgroundColor?: string | string[]
    label?: string
  }

  export interface FunnelControllerChartOptions {
    indexAxis?: 'x' | 'y'
  }

  export class FunnelController {
    static readonly id: string
  }

  export class TrapezoidElement {
    static readonly id: string
  }
}

// Top-level Chart.js augmentation (must be outside the module declaration to merge correctly)
declare module 'chart.js' {
  import type { FunnelControllerChartOptions, FunnelControllerDatasetOptions } from 'chartjs-chart-funnel'

  interface ChartTypeRegistry {
    funnel: {
      chartOptions: FunnelControllerChartOptions
      datasetOptions: FunnelControllerDatasetOptions
      defaultDataPoint: number
      metaExtensions: object
      parsedDataType: { x: number, y: number }
      scales: never
    }
  }
}
