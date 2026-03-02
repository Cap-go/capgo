import type { Context } from 'hono'
import { cloudlog, cloudlogErr } from './logging.ts'
import { getEnv } from './utils.ts'

export interface SSOProviderResponse {
  id: string
  type: 'saml'
  domains: string[]
  metadata_url: string
  attribute_mapping?: Record<string, string>
  created_at: string
  updated_at: string
}

export interface SSOProviderUpdate {
  domains?: string[]
  metadata_url?: string
  attribute_mapping?: Record<string, string>
}

class ManagementAPIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message)
    this.name = 'ManagementAPIError'
  }
}

async function callManagementAPI(
  c: Context,
  method: string,
  path: string,
  body?: any,
): Promise<any> {
  const token = getEnv(c, 'SUPABASE_MANAGEMENT_API_TOKEN')
  const projectRef = getEnv(c, 'SUPABASE_PROJECT_REF')

  if (!token) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'SUPABASE_MANAGEMENT_API_TOKEN not configured',
    })
    throw new ManagementAPIError(500, 'management_api_not_configured', 'Management API token not configured')
  }

  if (!projectRef) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'SUPABASE_PROJECT_REF not configured',
    })
    throw new ManagementAPIError(500, 'project_ref_not_configured', 'Project reference not configured')
  }

  const url = `https://api.supabase.com/v1/projects/${projectRef}${path}`

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  try {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Calling Supabase Management API',
      method,
      path,
    })

    const response = await fetch(url, options)

    if (!response.ok) {
      let errorData: any = {}
      try {
        errorData = await response.json()
      }
      catch {}
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Management API error',
        status: response.status,
        path,
        method,
        errorCode: errorData?.error_code || 'unknown',
      })
      throw new ManagementAPIError(
        response.status,
        errorData?.error_code || 'management_api_error',
        errorData?.message || `Management API returned ${response.status}`,
        errorData,
      )
    }

    const data = await response.json()
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Management API call successful',
      method,
      path,
    })
    return data
  }
  catch (error) {
    if (error instanceof ManagementAPIError) {
      throw error
    }
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Management API fetch error',
      path,
      method,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new ManagementAPIError(
      500,
      'management_api_fetch_error',
      'Failed to call Management API',
      error instanceof Error ? { message: error.message } : {},
    )
  }
}

export async function createSSOProvider(
  c: Context,
  domain: string,
  metadataUrl: string,
  attributeMapping?: Record<string, string>,
): Promise<SSOProviderResponse> {
  const body = {
    type: 'saml',
    domains: [domain],
    metadata_url: metadataUrl,
    ...(attributeMapping && { attribute_mapping: attributeMapping }),
  }

  const response = await callManagementAPI(c, 'POST', '/config/auth/sso/providers', body)
  return response as SSOProviderResponse
}

export async function getSSOProvider(
  c: Context,
  providerId: string,
): Promise<SSOProviderResponse> {
  const response = await callManagementAPI(c, 'GET', `/config/auth/sso/providers/${providerId}`)
  return response as SSOProviderResponse
}

export async function updateSSOProvider(
  c: Context,
  providerId: string,
  updates: Partial<SSOProviderUpdate>,
): Promise<SSOProviderResponse> {
  const body: any = {}

  if (updates.domains) {
    body.domains = updates.domains
  }
  if (updates.metadata_url) {
    body.metadata_url = updates.metadata_url
  }
  if (updates.attribute_mapping) {
    body.attribute_mapping = updates.attribute_mapping
  }

  const response = await callManagementAPI(c, 'PATCH', `/config/auth/sso/providers/${providerId}`, body)
  return response as SSOProviderResponse
}

export async function deleteSSOProvider(
  c: Context,
  providerId: string,
): Promise<void> {
  await callManagementAPI(c, 'DELETE', `/config/auth/sso/providers/${providerId}`)
}
