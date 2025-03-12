/**
 * Validates if a string is a properly formatted URL
 * @param url The URL string to validate
 * @returns boolean indicating if the URL is valid
 */
export function isValidUrl(url: string): boolean {
  try {
    // Check if URL is empty or null
    if (!url)
      return false

    // Use URL constructor for validation
    const urlObj = new URL(url)

    // Check if protocol is http or https
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  }
  catch {
    return false
  }
}
