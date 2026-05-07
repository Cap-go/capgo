/**
 * Optimized chart data processing utilities
 */

/**
 * Fast array initialization with undefined values
 */
export function createUndefinedArray(length: number): (number | undefined)[] {
  const arr: (number | undefined)[] = Array.from({ length })
  // Don't fill with undefined - Array.from already does this
  return arr
}

/**
 * Optimized array increment with undefined handling
 */
export function incrementArrayValue(arr: (number | undefined)[], index: number, increment: number): void {
  arr[index] = (arr[index] === undefined ? 0 : arr[index]) + increment
}
