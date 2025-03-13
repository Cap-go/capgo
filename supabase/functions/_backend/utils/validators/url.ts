/**
 * Validates if a string is a valid URL
 * @param url The URL to validate
 * @returns boolean indicating if the URL is valid
 */
export function isValidUrl(url: string): boolean {
  if (!url) return false
  
  try {
    // Use URL constructor for validation
    const urlObj = new URL(url)
    // Check if protocol is http or https
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch (e) {
    return false
  }
}
