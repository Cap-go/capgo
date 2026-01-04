import type { Context } from 'hono'
import { existInEnv, getEnv } from './utils.ts'

// Antartica and Tor are redirected to EU in our snippet
type ContinentsCFWorker = 'EU' | 'NA' | 'AS' | 'OC' | 'SA' | 'AF' | 'ME' | 'HK'
type RegionsAWS = 'EU' | 'NA' | 'SA' | 'AF' | 'AP' | 'ME' | 'IL' | 'CA' | 'MX'
type DbRegionSB = 'EU' | 'NA' | 'AS_JAPAN' | 'AS_INDIA' | 'SA' | 'OC' | undefined

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

export function getClientDbRegionSB(c: Context): DbRegionSB {
  // 1. Supabase Edge Functions provide region in ENV VAR SB_REGION (e.g., eu-west-3, us-east-1, ap-southeast-1)
  // 2. Cloudflare Workers: we use the name of the worker to ensure there is no weird placement (primary deployment, 99% of traffic)
  const continent = getContinentSB(c) ?? getContinentCF(c)
  switch (continent) {
    case 'EU': // Europe CF, AWS
    case 'IL': // Israel AWS
      return 'EU'
    case 'ME': // Middle East AWS
    case 'AF': // Africa, CF, AWS
    case 'AS': // Asia CF
    case 'AP': // Asia Pacific AWS
      return 'AS_INDIA'
    case 'HK': // Hong Kong/China CF
      return 'AS_JAPAN'
    case 'OC': // Oceania CF
      return 'OC'
    case 'NA': // North America CF, AWS
    case 'CA': // Canada AWS
    case 'MX': // Mexico AWS
      return 'NA'
    case 'SA': // South America
      return 'SA'
    default:
      return undefined
  }
}
