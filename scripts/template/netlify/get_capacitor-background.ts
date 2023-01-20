import type { BaseHeaders } from 'supabase/functions/_utils/types'
import type { BackgroundHandler } from '@netlify/functions'
import AdmZip from 'adm-zip'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/types/supabase.types'

export const methodJson = ['POST', 'PUT', 'PATCH']

export const supabaseClient = () => {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '', options)
}
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36',
}

const getPackage = async (id: string) => {
  const body = {
    pnames: [id],
    exclude: ['alpha', 'beta'],
  }
  const response = await fetch('https://www.apkmirror.com/wp-json/apkm/v1/app_exists/', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'User-Agent': 'APKMirror.js-v0.0.1',
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from('api-apkupdater:rm5rcfruUjKy04sMpyMPJXW8').toString('base64')}`,
    },
  })
  const res = await response.json()
  console.log('res', res)
  return res.data[0]
}

const isCapacitor = async (id: string) => {
  let found = false
  try {
    const res = await getPackage(id)
    const pageHome = `https://www.apkmirror.com${res.apks[0].link}`
    //   console.log('pageHome', pageHome)
    const response = await fetch(pageHome, { headers })
    const resTxt = await response.text()
    const matchKey = resTxt.match(/\?key=(.*)"/)
    if (!matchKey)
      return found
    const pageDownload = `${pageHome}download/?key=${matchKey[1]}`
    //   console.log('pageDownload', pageDownload)
    const responseDownload = await fetch(pageDownload, { headers })
    const resTxtresponseDownload = await responseDownload.text()
    const matchResponseDownload = resTxtresponseDownload.match(/\/download\.php\?(.*)"/)
    if (!matchResponseDownload)
      return found
    //   console.log('matchResponseDownload', matchResponseDownload[0])
    let downloadUrl = `https://www.apkmirror.com/wp-content/themes/APKMirror${matchResponseDownload[0]}`
    downloadUrl = downloadUrl.replace('"', '')
    //   console.log('downloadUrl', downloadUrl)
    const responseApk = await fetch(downloadUrl, { headers })
    const arrayBuffer = await responseApk.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const zip = new AdmZip(buffer)
    const zipEntries = zip.getEntries() // an array of ZipEntry records
    zipEntries.forEach((zipEntry) => {
      // console.log('zipEntry', zipEntry.entryName)
      if (zipEntry.entryName === 'assets/capacitor.config.json') {
        console.log(zipEntry.getData().toString('utf8'))
        found = true
      }
    })
  }
  catch (e) {
    console.log('error', id, e)
  }
  //   console.log('found', id, found)
  return found
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', url, headers, method, body)
  // remove from list apps already in supabase
  const res = await isCapacitor(body.appId)
  // save in supabase
  const { error } = await supabaseClient()
    .from('store_apps')
    .upsert({
      appId: body.appId,
      capacitor: res,
    })
  if (error)
    console.log('error', error)
}
// upper is ignored during netlify generation phase
// import from here
export const handler: BackgroundHandler = async (event) => {
  try {
    const url: URL = new URL(event.rawUrl)
    console.log('queryStringParameters', event.queryStringParameters)
    const headers: BaseHeaders = { ...event.headers }
    const method: string = event.httpMethod
    const body: any = methodJson.includes(method) ? JSON.parse(event.body || '{}') : event.queryStringParameters
    await main(url, headers, method, body)
  }
  catch (e) {
    console.log('error', e)
  }
}
