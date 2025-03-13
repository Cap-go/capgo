/**
 * LRU (Least Recently Used) Cache implementation
 * Limits cache size to prevent memory growth
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private maxSize: number

  /**
   * Create a new LRU cache with a maximum size
   * @param maxSize Maximum number of entries to store (default: 1000)
   */
  constructor(maxSize = 1000) {
    this.maxSize = maxSize
  }

  /**
   * Get a value from the cache
   * @param key The key to look up
   * @returns The cached value or undefined if not found
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key))
      return undefined

    // Access refreshes the item in the LRU order
    const value = this.cache.get(key)
    this.cache.delete(key)
    this.cache.set(key, value!)
    return value
  }

  /**
   * Set a value in the cache
   * @param key The key to store
   * @param value The value to store
   */
  set(key: K, value: V): void {
    // If key exists, refresh its position
    if (this.cache.has(key))
      this.cache.delete(key)

    // Evict oldest item if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }

    this.cache.set(key, value)
  }

  /**
   * Check if a key exists in the cache
   * @param key The key to check
   * @returns True if the key exists, false otherwise
   */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get the current number of entries in the cache
   */
  get size(): number {
    return this.cache.size
  }
}
