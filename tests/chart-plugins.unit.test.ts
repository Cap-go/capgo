import { describe, expect, it, vi } from 'vitest'

import { inlineAnnotationPlugin } from '../src/services/chartAnnotations'
import { todayLinePlugin, verticalLinePlugin } from '../src/services/chartTooltip'

describe('chart plugins', () => {
  it('skips drawing the vertical hover line when the chart context is gone', () => {
    expect(() => verticalLinePlugin.afterDatasetsDraw({
      ctx: null,
      tooltip: {
        getActiveElements: () => [{ element: { x: 12 } }],
      },
      scales: {
        y: {
          top: 10,
          bottom: 90,
        },
      },
      options: {
        plugins: {},
      },
    } as any)).not.toThrow()
  })

  it('skips drawing the today line when the chart context is gone', () => {
    expect(() => todayLinePlugin.afterDatasetsDraw({
      ctx: null,
      chartArea: {
        top: 10,
        bottom: 90,
      },
      scales: {
        x: {
          getPixelForValue: () => 24,
        },
        y: {
          top: 10,
          bottom: 90,
        },
      },
    } as any, undefined, {
      enabled: true,
      xIndex: 2,
      label: 'Today',
    })).not.toThrow()
  })

  it('skips drawing the vertical hover line when the canvas is disconnected', () => {
    const ctx = {
      save: vi.fn(),
    }

    expect(() => verticalLinePlugin.afterDatasetsDraw({
      ctx,
      canvas: {
        isConnected: false,
      },
      tooltip: {
        getActiveElements: () => [{ element: { x: 12 } }],
      },
      scales: {
        y: {
          top: 10,
          bottom: 90,
        },
      },
      options: {
        plugins: {},
      },
    } as any)).not.toThrow()

    expect(ctx.save).not.toHaveBeenCalled()
  })

  it('skips drawing the today line when the canvas is disconnected', () => {
    const ctx = {
      save: vi.fn(),
    }

    expect(() => todayLinePlugin.afterDatasetsDraw({
      ctx,
      canvas: {
        isConnected: false,
      },
      chartArea: {
        top: 10,
        bottom: 90,
      },
      scales: {
        x: {
          getPixelForValue: () => 24,
        },
        y: {
          top: 10,
          bottom: 90,
        },
      },
    } as any, undefined, {
      enabled: true,
      xIndex: 2,
      label: 'Today',
    })).not.toThrow()

    expect(ctx.save).not.toHaveBeenCalled()
  })

  it('skips inline annotations when the chart context is gone', () => {
    expect(() => inlineAnnotationPlugin.afterDatasetsDraw({
      ctx: null,
      chartArea: {
        left: 0,
        right: 100,
      },
      scales: {
        x: {
          getPixelForValue: () => 10,
        },
        y: {
          getPixelForValue: () => 20,
        },
      },
    }, undefined, {
      line_limit: {
        yMin: 3,
        yMax: 3,
        borderColor: '#fff',
        borderWidth: 1,
      },
      label_limit: {
        xValue: 1,
        yValue: 3,
        backgroundColor: '#000',
        content: ['Limit'],
        borderWidth: 1,
        font: {
          size: 12,
        },
      },
    } as any)).not.toThrow()
  })
})
