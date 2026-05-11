interface ApiKeyLookupFilter {
  column: 'id' | 'key'
  value: number | string
}

export function getApiKeyLookupFilter(id: string): ApiKeyLookupFilter {
  if (/^\d+$/.test(id)) {
    return {
      column: 'id',
      value: Number(id),
    }
  }

  // Legacy compatibility only. New clients should use numeric API key IDs so
  // plaintext key values are not placed in request URLs.
  return {
    column: 'key',
    value: id,
  }
}
