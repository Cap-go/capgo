import { describe, expect, it } from 'vitest'
import { __translationWorkerTestUtils__ } from '../cloudflare_workers/translation/index.ts'
import sourceMessages from '../messages/en.json'

describe('translation queue helpers', () => {
  it.concurrent('splits the English catalog into bounded queue batches', () => {
    const batches = __translationWorkerTestUtils__.buildBatches(sourceMessages as Record<string, string>)

    expect(batches.length).toBeGreaterThan(1)
    expect(batches.every(batch => batch.length <= 60)).toBe(true)
  })

  it.concurrent('keeps source text when translation drops a placeholder', () => {
    expect(__translationWorkerTestUtils__.keepTranslation('Used {count} times', 'Utilise plusieurs fois')).toBe('Used {count} times')
  })

  it.concurrent('normalizes invalid queued batch indexes to the first batch', () => {
    expect(__translationWorkerTestUtils__.normalizeBatchIndex(-1)).toBe(0)
    expect(__translationWorkerTestUtils__.normalizeBatchIndex(1.5)).toBe(0)
    expect(__translationWorkerTestUtils__.normalizeBatchIndex(2)).toBe(2)
  })

  it.concurrent('maps claimed queue batch indexes back to their batch', () => {
    const marker = __translationWorkerTestUtils__.translationBatchClaimMarker(2)

    expect(marker).toBeGreaterThan(2)
    expect(__translationWorkerTestUtils__.claimedTranslationBatchIndex(marker)).toBe(2)
    expect(__translationWorkerTestUtils__.claimedTranslationBatchIndex(2)).toBeNull()
    expect(__translationWorkerTestUtils__.translationBatchIndexFromStore(marker)).toBe(2)
  })

  it.concurrent('keeps pending queue state longer than ready cache entries', () => {
    expect(__translationWorkerTestUtils__.translationStoreTtlSeconds({ status: 'pending' })).toBeGreaterThan(
      __translationWorkerTestUtils__.translationStoreTtlSeconds({ status: 'ready' }),
    )
  })
})
