export interface ManifestCacheEntryLike {
  file_name: string | null | undefined
  file_hash: string | null | undefined
  s3_path: string | null | undefined
}

export interface ManifestCacheEntry {
  file_name: string
  file_hash: string
  s3_path: string
}

export function compactManifestCacheEntries(entries: readonly ManifestCacheEntryLike[]): ManifestCacheEntry[] {
  return entries.flatMap((entry) => {
    if (!entry.file_name || !entry.file_hash || !entry.s3_path)
      return []

    return [{
      file_name: entry.file_name,
      file_hash: entry.file_hash,
      s3_path: entry.s3_path,
    }]
  })
}

export function buildManifestCacheEntries(entries: readonly ManifestCacheEntryLike[]): ManifestCacheEntry[] {
  return compactManifestCacheEntries(entries)
}
