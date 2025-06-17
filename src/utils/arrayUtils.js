/**
 * Checks if exactly one object property in an array matches a given string
 * @param {Array} array - Array of objects to search through
 * @param {string} property - Property name to check
 * @param {string} value - String value to match against
 * @returns {boolean} - True if exactly one match is found, false otherwise
 */
export function hasExactlyOneMatch(array, property, value) {
  const matches = array.filter(obj => obj[property] === value)
  return matches.length === 1
}
