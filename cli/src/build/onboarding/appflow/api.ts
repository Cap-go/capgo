// Appflow GraphQL + REST client used by the migration. Mirrors the dashboard
// (same User-Agent + Origin). Records a REDACTED request/response trace into the
// onboarding internal log so the support bundle carries the Appflow API trace.
// Secret values (tokens, passwords, cert/keystore bytes, service-account JSON)
// are NEVER written to the log.
const API = 'https://api.ionicjs.com'
const DASH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0'
const ORIGIN = 'https://dashboard.ionicframework.com'

export const stripDataUri = (s: string): string => (typeof s === 'string' && s.includes('base64,')) ? s.split('base64,')[1] : s
export const bundleIdFromAppIdentifier = (ai: string): string => String(ai || '').split('.').slice(1).join('.') || String(ai || '')

export function mapIosSigning(raw: any): Record<string, string> {
  const provMap: Record<string, { profile: string, name: string }> = {}
  for (const p of raw?.provisioning_profiles || [])
    provMap[bundleIdFromAppIdentifier(p.application_identifier)] = { profile: stripDataUri(p.provisioning_profile_file), name: p.name }
  return {
    BUILD_CERTIFICATE_BASE64: stripDataUri(raw?.cert_file),
    P12_PASSWORD: raw?.cert_password ?? '',
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(provMap),
  }
}

export function mapIosDistribution(raw: any): Record<string, string> {
  return {
    FASTLANE_USER: raw?.user_name,
    FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD: raw?.app_specific_password,
    APPLE_APP_ID: String(raw?.apple_app_id),
    APP_STORE_CONNECT_TEAM_ID: raw?.team_id,
  }
}

export function mapAndroidSigning(raw: any): Record<string, string> {
  return {
    ANDROID_KEYSTORE_FILE: stripDataUri(raw?.keystore_file),
    KEYSTORE_STORE_PASSWORD: raw?.keystore_password,
    KEYSTORE_KEY_PASSWORD: raw?.key_password,
    KEYSTORE_KEY_ALIAS: raw?.key_alias,
  }
}

export function mapAndroidDistribution(raw: any): Record<string, string> {
  return { PLAY_CONFIG_JSON: stripDataUri(raw?.json_key_file) }
}

export const redactTrace = (method: string, url: string, status: number | string, shapeKeys: string[]): string =>
  `appflow ${method} ${url} -> ${status} {${shapeKeys.join(',')}}`

const Q_BOOTSTRAP = `query BootstrapApp { viewer { organizations { edges { node { id name plan memberTotal slug apps { totalCount } } } } } }`
const Q_ORG_APPS = `query OrganizationApps($slug: String!, $first: Int) { organization(slug: $slug) { apps(first: $first) { edges { node { id name slug nativeType } } totalCount } } }`
const Q_CERTS = `query GetDataForPackageCerts($appId: String!) { app(id: $appId) { id name nativeType certificates { edges { node { id name tag type credentials { ios { filename fingerprint notValidAfter subjectCommonName provisioningProfiles { id applicationIdentifier filename } } android { filename fingerprint keyAlias notValidAfter subjectCommonName } } } } } } }`

export function createAppflowApi(token: string, log: (s: string) => void = () => {}) {
  const headers = {
    'User-Agent': DASH_UA,
    Accept: '*/*',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Origin: ORIGIN,
  }
  async function rest(path: string): Promise<any> {
    const res = await fetch(`${API}${path}`, { headers })
    const j: any = await res.json().catch(() => null)
    log(redactTrace('GET', path, res.status, j?.data ? Object.keys(j.data) : []))
    return j?.data
  }
  async function gql(operationName: string, query: string, variables?: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${API}/graphql`, { method: 'POST', headers, body: JSON.stringify({ query, variables, operationName }) })
    const j: any = await res.json().catch(() => null)
    log(redactTrace('POST', `/graphql ${operationName}`, res.status, j?.data ? Object.keys(j.data) : []))
    return j?.data
  }
  return {
    async listOrgs(): Promise<any[]> {
      const d = await gql('BootstrapApp', Q_BOOTSTRAP)
      return (d?.viewer?.organizations?.edges || []).map((e: any) => e.node)
    },
    async listApps(slug: string): Promise<any[]> {
      const d = await gql('OrganizationApps', Q_ORG_APPS, { slug, first: 100 })
      return (d?.organization?.apps?.edges || []).map((e: any) => e.node)
    },
    async listCertificates(appId: string): Promise<any[]> {
      const d = await gql('GetDataForPackageCerts', Q_CERTS, { appId })
      return (d?.app?.certificates?.edges || []).map((e: any) => e.node)
    },
    async listDistribution(appId: string): Promise<any[]> {
      return (await rest(`/apps/${appId}/distribution-credentials`)) || []
    },
    async fetchIosSigning(appId: string, tag: string): Promise<Record<string, string>> {
      return mapIosSigning(await rest(`/apps/${appId}/profiles/${tag}/credentials/ios`))
    },
    async fetchAndroidSigning(appId: string, tag: string): Promise<Record<string, string>> {
      return mapAndroidSigning(await rest(`/apps/${appId}/profiles/${tag}/credentials/android`))
    },
    async fetchIosDistribution(appId: string, id: number | string): Promise<Record<string, string>> {
      return mapIosDistribution(await rest(`/apps/${appId}/distribution-credentials/${id}?fields=app_specific_password`))
    },
    async fetchAndroidDistribution(appId: string, id: number | string): Promise<Record<string, string>> {
      return mapAndroidDistribution(await rest(`/apps/${appId}/distribution-credentials/${id}?fields=json_key_file`))
    },
  }
}
