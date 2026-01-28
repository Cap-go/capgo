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

// Extend Chart.js type registry (must be at top-level for proper augmentation)
declare module 'chart.js' {
  interface ChartTypeRegistry {
    funnel: {
      chartOptions: import('chartjs-chart-funnel').FunnelControllerChartOptions
      datasetOptions: import('chartjs-chart-funnel').FunnelControllerDatasetOptions
      defaultDataPoint: number
      metaExtensions: object
      parsedDataType: { x: number, y: number }
      scales: never
    }
  }
}
