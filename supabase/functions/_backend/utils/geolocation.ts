import type { Context } from 'hono'
import { cloudlog } from './logging.ts'
import { existInEnv, getEnv } from './utils.ts'

// Antartica and Tor are redirected to EU in our snippet
type ContinentsCFWorker = 'EU' | 'NA' | 'AS' | 'OC' | 'SA' | 'AF'
type RegionsAWS = 'EU' | 'NA' | 'SA' | 'AF' | 'AP' | 'ME' | 'IL' | 'CA' | 'MX'
// TODO: Enable OC when ready
type DbRegionD1 = 'EU' | 'NA' | 'AS' | 'OC' | undefined
// type DbRegionD1 = 'EU' | 'NA' | 'AS' | 'OC' | undefined
type DbRegionSB = 'EU' | 'NA' | 'AS' | undefined

export function getContinentCF(c: Context): ContinentsCFWorker | undefined {
  if (!existInEnv(c, 'ENV_NAME')) {
    return undefined
  }
  // const cfData = (c.req.raw as Request & { cf?: { continent?: string } })?.cf
  // return cfData?.continent
  // capgo_plugin-eu-prod-12.46.2
  const nameContinent = (getEnv(c, 'ENV_NAME')?.split('-')[1]).toUpperCase()
  return nameContinent as ContinentsCFWorker
}

export function getContinentSB(c: Context): RegionsAWS | undefined {
  if (!existInEnv(c, 'SB_REGION')) {
    return undefined
  }
  const sbRegion = getEnv(c, 'SB_REGION')!.split('-')[0].toUpperCase()
  return sbRegion as RegionsAWS
}
/**
 * Get database region from request context based on deployment platform
 * Maps client location to database regions: EU (Europe/Africa), US (Americas), AS (Asia/Oceania)
 * @param c Hono context
 * @returns Database region code: 'EU', 'US', 'AS', or undefined
 */
export function getClientDbRegionD1(c: Context): DbRegionD1 {
  const continent = getContinentCF(c)
  cloudlog({ requestId: c.get('requestId'), message: 'nameContinent', continent, source: 'env-check' })
  if (continent) {
    switch (continent) {
      case 'EU': // Europe
      case 'AF': // Africa
        return 'EU'
      case 'AS': // Asia
      case 'OC': // Oceania
        return 'AS'
        // TODO: Enabled Oceania mapping when ready
        // case 'AS': // Asia
        //   return 'AS'
        // case 'OC': // Oceania
        //   return 'OC'
      case 'NA': // North America
      case 'SA': // South America
        return 'NA'
      default:
        return undefined
    }
  }
}

export function getClientDbRegionSB(c: Context): DbRegionSB {
  // 1. Supabase Edge Functions provide region in ENV VAR SB_REGION (e.g., eu-west-3, us-east-1, ap-southeast-1)
  // 2. Cloudflare Workers: we use the name of the worker to ensure there is no weird placement (primary deployment, 99% of traffic)
  const continent = getContinentSB(c) ?? getContinentCF(c)
  switch (continent) {
    case 'EU': // Europe CF, AWS
    case 'AF': // Africa, CF, AWS
    case 'ME': // Middle East AWS
    case 'IL': // Israel AWS
      return 'EU'
    case 'AS': // Asia CF
    case 'AP': // Asia Pacific AWS
    case 'OC': // Oceania CF
      return 'AS'
    case 'NA': // North America CF, AWS
    case 'CA': // Canada AWS
    case 'MX': // Mexico AWS
    case 'SA': // South America CF, AWS
      return 'NA'
    default:
      return undefined
  }
}
