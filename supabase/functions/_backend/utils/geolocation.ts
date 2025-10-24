import type { Context } from 'hono'
import { cloudlog } from './loggin.ts'

// Map country code to database region (ISO 3166-1 alpha-2 to DB region)
// Database regions: EU (Europe/Africa), US (Americas), AS (Asia/Oceania)
function getDbRegionFromCountryCode(countryCode: string | undefined): 'EU' | 'US' | 'AS' | undefined {
  if (!countryCode)
    return undefined

  // Asia (AS) - includes Middle East
  const asiaCountries = ['CN', 'IN', 'ID', 'PK', 'BD', 'JP', 'PH', 'VN', 'TR', 'IR', 'TH', 'MM', 'KR', 'IQ', 'AF', 'SA', 'UZ', 'MY', 'NP', 'YE', 'KP', 'LK', 'KH', 'JO', 'AZ', 'TJ', 'AE', 'IL', 'HK', 'LA', 'SG', 'LB', 'KG', 'TM', 'SY', 'KW', 'GE', 'OM', 'MN', 'AM', 'QA', 'BH', 'TL', 'BT', 'MO', 'MV', 'BN']
  // Europe (EU) - includes Africa
  const europeCountries = ['RU', 'DE', 'GB', 'FR', 'IT', 'ES', 'UA', 'PL', 'RO', 'NL', 'BE', 'CZ', 'GR', 'PT', 'SE', 'HU', 'BY', 'AT', 'RS', 'CH', 'BG', 'DK', 'FI', 'SK', 'NO', 'IE', 'HR', 'BA', 'AL', 'LT', 'SI', 'LV', 'MK', 'EE', 'ME', 'LU', 'MT', 'IS', 'MD', 'LI', 'SM', 'MC', 'VA', 'AD']
  // Africa (mapped to EU region)
  const africaCountries = ['NG', 'ET', 'EG', 'CD', 'TZ', 'ZA', 'KE', 'UG', 'DZ', 'SD', 'MA', 'AO', 'GH', 'MZ', 'MG', 'CM', 'CI', 'NE', 'BF', 'ML', 'MW', 'ZM', 'SO', 'SN', 'TD', 'ZW', 'GN', 'RW', 'BJ', 'TN', 'BI', 'SS', 'TG', 'SL', 'LY', 'LR', 'MR', 'CF', 'ER', 'GM', 'BW', 'GA', 'GW', 'GQ', 'MU', 'SZ', 'DJ', 'RE', 'KM', 'CV', 'ST', 'SC', 'YT', 'EH']
  // Americas (US) - North and South America
  const americasCountries = ['US', 'MX', 'CA', 'GT', 'CU', 'HT', 'DO', 'HN', 'NI', 'SV', 'CR', 'PA', 'JM', 'TT', 'BS', 'BZ', 'BB', 'LC', 'GD', 'VC', 'AG', 'DM', 'KN', 'GL', 'PR', 'VI', 'BM', 'BR', 'CO', 'AR', 'PE', 'VE', 'CL', 'EC', 'BO', 'PY', 'UY', 'GY', 'SR', 'GF', 'FK']
  // Oceania (mapped to AS region)
  const oceaniaCountries = ['AU', 'PG', 'NZ', 'FJ', 'SB', 'NC', 'PF', 'WS', 'GU', 'KI', 'FM', 'VU', 'TO', 'PW', 'MH', 'NR', 'TV', 'AS', 'MP', 'CK', 'WF', 'NU', 'TK', 'PN']

  if (asiaCountries.includes(countryCode) || oceaniaCountries.includes(countryCode))
    return 'AS'
  if (europeCountries.includes(countryCode) || africaCountries.includes(countryCode))
    return 'EU'
  if (americasCountries.includes(countryCode))
    return 'US'

  return undefined // Unknown
}

// Map continent codes to database regions
// Continents: EU, AS, NA, SA, AF, OC -> Database regions: EU, US, AS
function mapContinentToDbRegion(continent: string | undefined): 'EU' | 'US' | 'AS' | undefined {
  if (!continent)
    return undefined

  switch (continent) {
    case 'EU': // Europe
    case 'AF': // Africa
      return 'EU'
    case 'AS': // Asia
    case 'OC': // Oceania
      return 'AS'
    case 'NA': // North America
    case 'SA': // South America
      return 'US'
    default:
      return undefined
  }
}

/**
 * Get database region from request context based on deployment platform
 * Maps client location to database regions: EU (Europe/Africa), US (Americas), AS (Asia/Oceania)
 * @param c Hono context
 * @returns Database region code: 'EU', 'US', 'AS', or undefined
 */
export function getClientDbRegion(c: Context): 'EU' | 'US' | 'AS' | undefined {
  // 1. Cloudflare Workers: c.req.raw.cf?.continent (primary deployment, 99% of traffic)
  const cfData = (c.req.raw as Request & { cf?: { continent?: string } })?.cf
  if (cfData?.continent) {
    const dbRegion = mapContinentToDbRegion(cfData.continent)
    cloudlog({ requestId: c.get('requestId'), message: 'dbRegion', region: dbRegion, continent: cfData.continent, source: 'cloudflare' })
    return dbRegion
  }

  // 2. Netlify Edge Functions: context.geo.country.code (backup deployment)
  // Netlify provides country code in context.geo, we map it to DB region
  if (c.env && typeof c.env === 'object' && 'geo' in c.env) {
    const netlifyGeo = (c.env as Record<string, unknown>).geo as { country?: { code?: string } } | undefined
    const countryCode = netlifyGeo?.country?.code
    if (countryCode) {
      const dbRegion = getDbRegionFromCountryCode(countryCode)
      cloudlog({ requestId: c.get('requestId'), message: 'dbRegion', region: dbRegion, countryCode, source: 'netlify' })
      return dbRegion
    }
  }

  // 3. Supabase Functions: x-sb-edge-region header
  // Supabase Edge Functions provide region in x-sb-edge-region header (e.g., eu-west-3, us-east-1, ap-southeast-1)
  // Map AWS region codes directly to DB regions
  const sbRegion = c.req.header('x-sb-edge-region')
  if (sbRegion) {
    let dbRegion: 'EU' | 'US' | 'AS' | undefined
    // Parse AWS region code prefix
    if (sbRegion.startsWith('ap-') || sbRegion.startsWith('me-')) {
      // Asia Pacific and Middle East regions -> AS
      dbRegion = 'AS'
    }
    else if (sbRegion.startsWith('us-') || sbRegion.startsWith('ca-') || sbRegion.startsWith('sa-')) {
      // Americas regions -> US
      dbRegion = 'US'
    }
    else if (sbRegion.startsWith('eu-') || sbRegion.startsWith('af-')) {
      // Europe and Africa regions -> EU
      dbRegion = 'EU'
    }

    cloudlog({ requestId: c.get('requestId'), message: 'dbRegion', region: dbRegion, awsRegion: sbRegion, source: 'supabase-region' })
    if (dbRegion)
      return dbRegion
  }

  // 4. Deno Deploy: x-country header (fallback)
  // Deno Deploy provides x-country header with ISO country code
  const xCountry = c.req.header('x-country')
  if (xCountry) {
    const dbRegion = getDbRegionFromCountryCode(xCountry)
    cloudlog({ requestId: c.get('requestId'), message: 'dbRegion', region: dbRegion, countryCode: xCountry, source: 'deno-deploy' })
    return dbRegion
  }

  // 5. Last resort: log IP for debugging but return undefined
  const forwardedFor = c.req.header('x-forwarded-for')
  if (forwardedFor) {
    const clientIp = forwardedFor.split(',')[0]?.trim()
    cloudlog({ requestId: c.get('requestId'), message: 'dbRegion', region: undefined, clientIp, source: 'ip-fallback' })
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'dbRegion', region: undefined, source: 'unknown' })
  }

  return undefined
}
