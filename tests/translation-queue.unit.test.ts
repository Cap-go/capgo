import { describe, expect, it } from 'vitest'
import sourceMessages from '../messages/en.json'
import { __translationTestUtils__ } from '../supabase/functions/_backend/public/translation.ts'

describe('translation queue helpers', () => {
  it.concurrent('splits the English catalog into bounded queue batches', () => {
    const batches = __translationTestUtils__.buildBatches(sourceMessages as Record<string, string>)

    expect(batches.length).toBeGreaterThan(1)
    expect(batches.every(batch => batch.length <= 60)).toBe(true)
  })

  it.concurrent('keeps source text when translation drops a placeholder', () => {
    expect(__translationTestUtils__.keepTranslation('Used {count} times', 'Utilise plusieurs fois')).toBe('Used {count} times')
  })

  it.concurrent('normalizes invalid queued batch indexes to the first batch', () => {
    expect(__translationTestUtils__.normalizeBatchIndex(-1)).toBe(0)
    expect(__translationTestUtils__.normalizeBatchIndex(1.5)).toBe(0)
    expect(__translationTestUtils__.normalizeBatchIndex(2)).toBe(2)
  })
})
