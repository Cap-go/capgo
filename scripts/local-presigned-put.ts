const encoder = new TextEncoder()
const DEFAULT_SERVICE_KEY = ''

function resolveCredentials() {
  const serviceKey = Deno.env.get('SERVICE_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? DEFAULT_SERVICE_KEY

  return { serviceKey }
}

function encodeObjectKey(objectKey: string) {
  return objectKey.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

async function requestSignedUploadUrl(
  endpoint: string,
  bucket: string,
  objectKey: string,
  serviceKey: string,
  { upsert }: { upsert: boolean },
) {
  const sanitizedEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint
  const url = `${sanitizedEndpoint}/object/upload/sign/${bucket}/${encodeObjectKey(objectKey)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'x-upsert': String(upsert),
    },
    body: '{}',
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to create signed upload URL: ${response.status} ${errorBody}`)
  }

  const result = await response.json() as { url?: string }
  if (!result.url) {
    throw new Error('Signed upload URL response missing url field')
  }

  const relative = result.url.startsWith('/') ? result.url : `/${result.url}`
  return `${sanitizedEndpoint}${relative}`
}

async function uploadWithSignedUrl(
  signedUrl: string,
  payload: Uint8Array,
  contentType: string,
) {
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: payload,
  })

  const bodyText = await response.text()
  console.log('Local storage response:', response.status)
  if (bodyText) {
    console.log('Response body:', bodyText)
  }

  if (!response.ok) {
    throw new Error(`Signed upload failed: ${response.status}`)
  }
}

async function main() {
  const { serviceKey } = resolveCredentials()
  if (!serviceKey) {
    throw new Error('Missing storage service-role key')
  }

  const endpoint = Deno.env.get('STORAGE_API_URL') ?? 'http://127.0.0.1:54321/storage/v1'
  const bucket = Deno.env.get('S3_BUCKET') ?? 'capgo'
  const objectKey = Deno.env.get('S3_OBJECT_KEY') ?? 'orgs/demo-app/example3.txt'
  const contentType = Deno.env.get('S3_UPLOAD_CONTENT_TYPE') ?? 'application/zip'
  const payload = encoder.encode(Deno.env.get('S3_UPLOAD_PAYLOAD') ?? 'local presign repro')

  console.log('Using Supabase signed upload URL flow (only Content-Type header used on upload).')

  const signedUrl = await requestSignedUploadUrl(endpoint, bucket, objectKey, serviceKey, {
    upsert: (Deno.env.get('S3_UPLOAD_UPSERT') ?? 'true') === 'true',
  })
  console.log('Signed upload URL:', signedUrl)

  await uploadWithSignedUrl(signedUrl, payload, contentType)
}

main().catch((error) => {
  console.error(error)
  Deno.exit(1)
})
