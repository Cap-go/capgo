/**
 * Optimized chart data processing utilities
 */

/**
 * Fast array initialization with undefined values
 */
export function createUndefinedArray(length: number): (number | undefined)[] {
  const arr = new Array(length)
  // Don't fill with undefined - Array constructor already does this
  return arr
}

/**
 * Fast array initialization with zero values
 */
export function createZeroArray(length: number): number[] {
  return new Array(length).fill(0)
}

/**
 * Optimized date difference calculation for billing cycles
 * Cache the cycleStart time to avoid repeated Date operations
 */
export function createDayDiffCalculator(cycleStart: Date) {
  const cycleStartTime = cycleStart.getTime()
  const msPerDay = 1000 * 60 * 60 * 24

  return (date: Date | string): number => {
    const dateTime = typeof date === 'string' ? new Date(date).getTime() : date.getTime()
    return Math.floor((dateTime - cycleStartTime) / msPerDay)
  }
}

/**
 * Fast object creation for app data arrays
 */
export function initializeAppDataArrays(appIds: string[], length: number, fillValue: number | undefined = undefined) {
  const result: { [appId: string]: (number | undefined)[] } = {}

  for (let i = 0; i < appIds.length; i++) {
    const appId = appIds[i]
    result[appId] = fillValue === undefined ? createUndefinedArray(length) : new Array(length).fill(fillValue)
  }

  return result
}

/**
 * Optimized aggregation function for chart data
 */
export function aggregateDataByKey<T extends Record<string, any>>(
  data: T[],
  keyGenerator: (item: T) => string,
  aggregateFields: string[]
): Record<string, any> {
  const result: Record<string, any> = {}

  for (let i = 0; i < data.length; i++) {
    const item = data[i]
    const key = keyGenerator(item)

    if (!result[key]) {
      result[key] = { ...item }
      // Initialize aggregate fields to 0
      for (let j = 0; j < aggregateFields.length; j++) {
        result[key][aggregateFields[j]] = 0
      }
    }

    // Sum aggregate fields
    for (let j = 0; j < aggregateFields.length; j++) {
      const field = aggregateFields[j]
      result[key][field] += item[field] || 0
    }
  }

  return result
}

/**
 * Optimized array increment with undefined handling
 */
export function incrementArrayValue(arr: (number | undefined)[], index: number, increment: number): void {
  arr[index] = (arr[index] === undefined ? 0 : arr[index]) + increment
}