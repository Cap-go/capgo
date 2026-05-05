interface NpmRegistryResponse {
  'dist-tags'?: {
    latest?: string
  }
}

/**
 * Fetches the latest version of an npm package from the registry
 * @param packageName - The name of the package to check
 * @returns The latest version string, or null if not found
 */
export async function getLatestVersion(packageName: string): Promise<string | null> {
  try {
    const encodedName = encodeURIComponent(packageName.toLowerCase())
    const packageUrl = `https://registry.npmjs.org/${encodedName}`

    const response = await fetch(packageUrl, {
      headers: {
        accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
      },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json() as NpmRegistryResponse
    // Get the latest version from dist-tags
    return data['dist-tags']?.latest || null
  }
  catch {
    return null
  }
}
