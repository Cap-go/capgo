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
  return createClient<Database>(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', options)
}
// const headers = {
//   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36',
// }

// const getPackage = async (id: string) => {
//   const body = {
//     pnames: [id],
//     exclude: ['alpha', 'beta'],
//   }
//   const response = await fetch('https://www.apkmirror.com/wp-json/apkm/v1/app_exists/', {
//     method: 'POST',
//     body: JSON.stringify(body),
//     headers: {
//       'User-Agent': 'APKMirror.js-v0.0.1',
//       'Content-Type': 'application/json',
//       'Authorization': `Basic ${Buffer.from('api-apkupdater:rm5rcfruUjKy04sMpyMPJXW8').toString('base64')}`,
//     },
//   })
//   const res = await response.json()
//   console.log('res', res)
//   return res.data[0]
// }

// const downloadApkMirror = async (id: string) => {
//   const res = await getPackage(id)
//   const pageHome = `https://www.apkmirror.com${res.apks[0].link}`
//   console.log('pageHome', pageHome)
//   const response = await fetch(pageHome, { headers })
//   const resTxt = await response.text()
//   const matchKey = resTxt.match(/\?key=(.*)"/)
//   if (!matchKey) {
//     console.log('no matchKey', resTxt)
//     return null
//   }
//   const pageDownload = `${pageHome}download/?key=${matchKey[1]}`
//   console.log('pageDownload', pageDownload)
//   const responseDownload = await fetch(pageDownload, { headers })
//   const resTxtresponseDownload = await responseDownload.text()
//   const matchResponseDownload = resTxtresponseDownload.match(/\/download\.php\?(.*)"/)
//   if (!matchResponseDownload) {
//     console.log('no matchResponseDownload', resTxtresponseDownload)
//     return null
//   }
//   console.log('matchResponseDownload', matchResponseDownload[0])
//   let downloadUrl = `https://www.apkmirror.com/wp-content/themes/APKMirror${matchResponseDownload[0]}`
//   downloadUrl = downloadUrl.replace('"', '')
//   console.log('downloadUrl', downloadUrl)
//   const responseApk = await fetch(downloadUrl, { headers })
//   const arrayBuffer = await responseApk.arrayBuffer()
//   const buffer = Buffer.from(arrayBuffer)
//   return buffer
// }

// fetch('https://d.apkpure.com/b/APK/com.pizzahutau?version=latest', {
//   headers: {
//     'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
//     'accept-language': 'en-GB,en;q=0.8',
//     'cache-control': 'no-cache',
//     'pragma': 'no-cache',
//     'sec-fetch-dest': 'document',
//     'sec-fetch-mode': 'navigate',
//     'sec-fetch-site': 'same-site',
//     'sec-fetch-user': '?1',
//     'sec-gpc': '1',
//     'upgrade-insecure-requests': '1',
//   },
//   referrer: 'https://m.apkpure.com/',
//   referrerPolicy: 'strict-origin-when-cross-origin',
//   body: null,
//   method: 'GET',
//   mode: 'cors',
//   credentials: 'include',
// })

const downloadApkPure = async (id: string, mode: 'APK' | 'XAPK' = 'APK') => {
  const downloadUrl = `https://d.apkpure.com/b/${mode}/${id}?version=latest`
  // https://d.apkpure.com/b/APK/com.pizzahutau?version=latest
  // const responseApk = await fetch(downloadUrl, { headers })
  const responseApk = await fetch(downloadUrl, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'accept-language': 'en-GB,en;q=0.8',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-site',
      'sec-fetch-user': '?1',
      'sec-gpc': '1',
      'upgrade-insecure-requests': '1',
    },
    redirect: 'follow',
    referrer: 'https://m.apkpure.com/',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: null,
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
  })
  const arrayBuffer = await responseApk.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return buffer
}

const isCapacitor = async (id: string) => {
  const found = {
    capacitor: false,
    cordova: false,
  }
  try {
    console.log('downloadApkPure', id)
    const buffer = await downloadApkPure(id)
    console.log('AdmZip', id)
    const zip = new AdmZip(buffer)
    const zipEntries = zip.getEntries() // an array of ZipEntry records
    zipEntries.forEach((zipEntry) => {
      // console.log('zipEntry', zipEntry.entryName)
      if (zipEntry.entryName === 'assets/capacitor.config.json') {
        console.log(zipEntry.getData().toString('utf8'))
        found.capacitor = true
      }
      if (zipEntry.entryName === 'res/xml/config.xml') {
        console.log(zipEntry.getData().toString('utf8'))
        found.cordova = true
      }
    })
  }
  catch (e) {
    console.log('error', id, e)
  }
  console.log('found', id, found)
  return found
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', method, body)
  try {
    // remove from list apps already in supabase
    const res = await isCapacitor(body.appId)
    // save in supabase
    const { error } = await supabaseClient()
      .from('store_apps')
      .upsert({
        app_id: body.appId,
        capacitor: res.capacitor,
        cordova: res.cordova,
        to_get_capacitor: false,
      })
    if (error)
      console.log('error', error)
  }
  catch (e) {
    console.log('error isCapacitor', e)
    const { error } = await supabaseClient()
      .from('store_apps')
      .upsert({
        app_id: body.appId,
        to_get_capacitor: false,
        error_get_capacitor: JSON.stringify(e),
      })
    if (error)
      console.log('error insert', error)
  }
}
// isCapacitor('pl.jmpolska.clos0.mojabiedronka').then((res) => {
//   console.log('res', res)
// })
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
    console.log('error general', e)
  }
}
