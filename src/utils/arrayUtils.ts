/**
 * Checks if exactly one object property in an array matches a given string
 * @param {Array} array - Array of objects to search through
 * @param {string} property - Property name to check
 * @param {string} value - The value to match against or a function to match against
 * @returns {boolean} - True if exactly one match is found, false otherwise
 */
export function hasExactlyOneMatch<T>(array: T[], property: keyof T, value: T[keyof T] | ((obj: T) => boolean)): boolean {
  const matches = array.filter((obj) => {
    if (typeof value === 'function') {
      return (value as ((obj: T) => boolean))(obj)
    }
    return obj[property] === value
  })
  return matches.length === 1
}
