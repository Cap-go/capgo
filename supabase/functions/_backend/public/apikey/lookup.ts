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

  return {
    column: 'key',
    value: id,
  }
}
