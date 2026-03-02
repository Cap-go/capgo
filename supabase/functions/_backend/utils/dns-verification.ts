export interface DnsVerificationResult {
  verified: boolean
  records?: string[]
  error?: string
}

interface CloudflareDnsResponse {
  Status: number
  Answer?: Array<{
    name: string
    type: number
    TTL: number
    data: string
  }>
}

/**
 * Verify a DNS TXT record via Cloudflare DNS-over-HTTPS (DoH)
 * Queries for _capgo-sso.{domain} TXT record and checks if expectedToken is present
 *
 * @param domain - Domain to verify (e.g., 'example.com')
 * @param expectedToken - Token to search for in TXT records
 * @returns DnsVerificationResult with verification status and found records
 */
export async function verifyDnsTxtRecord(
  domain: string,
  expectedToken: string,
): Promise<DnsVerificationResult> {
  try {
    // Validate domain format (basic check)
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      return {
        verified: false,
        error: 'Invalid domain',
      }
    }

    // Validate expectedToken is non-empty string
    if (!expectedToken || typeof expectedToken !== 'string' || expectedToken.trim().length === 0) {
      return {
        verified: false,
        error: 'Invalid expected token',
      }
    }

    const cleanDomain = domain.trim()
    const cleanToken = expectedToken.trim()
    const recordName = `_capgo-sso.${cleanDomain}`

    // Query Cloudflare DoH API
    const url = new URL('https://cloudflare-dns.com/dns-query')
    url.searchParams.set('name', recordName)
    url.searchParams.set('type', 'TXT')

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/dns-json',
      },
    })

    if (!response.ok) {
      return {
        verified: false,
        error: `DNS lookup failed: HTTP ${response.status}`,
      }
    }

    const data: CloudflareDnsResponse = await response.json()

    // Status 0 = NOERROR, Status 3 = NXDOMAIN (domain not found)
    if (data.Status !== 0) {
      return {
        verified: false,
        records: [],
      }
    }

    // Extract TXT record values
    const records: string[] = []
    let verified = false

    if (data.Answer && Array.isArray(data.Answer)) {
      for (const answer of data.Answer) {
        // TXT records have type 16
        if (answer.type === 16) {
          // TXT data may be quoted, remove quotes if present
          const recordValue = answer.data.replace(/^"(.*)"$/, '$1')
          records.push(recordValue)

          // Check if this record matches the expected token (exact match)
          if (recordValue === cleanToken) {
            verified = true
          }
        }
      }
    }

    return {
      verified,
      records,
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      verified: false,
      error: `DNS lookup failed: ${errorMessage}`,
    }
  }
}
