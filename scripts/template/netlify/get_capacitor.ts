import type { BaseHeaders } from 'supabase/functions/_utils/types'
import type { Handler } from '@netlify/functions'
import AdmZip from 'adm-zip'
import apk from 'apkmirror.js'
import type { IAppItem, IAppItemFullDetail } from 'google-play-scraper'
import gplay from 'google-play-scraper'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/types/supabase.types'

export const methodJson = ['POST', 'PUT', 'PATCH']
export const basicHeaders = {
  'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
  'Content-Type': 'application/json',
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export const sendRes = (data: any = { status: 'ok' }, statusCode = 200) => {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  return new Response(
    JSON.stringify(data),
    {
      status: statusCode,
      headers: { ...basicHeaders, ...corsHeaders },
    },
  )
}

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

const isCapacitor = async (id: string) => {
  let found = false
  try {
    const res = await apk.getPackages([id])
    const pageHome = `https://www.apkmirror.com${res[0].apks[0].link}`
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
// com.canva.editor
// isCapacitor('de.burgerking.kingfinder')
// isCapacitor('com.canva.editor')

interface resList extends IAppItem {
  category: string
  developerEmail: string
  installs: number
  collection: string
  rank: number
}

interface resApp extends resList {
  capacitor: boolean
}

const getList = async (category = gplay.category.APPLICATION, collection = gplay.collection.TOP_FREE, limit = 1000) => {
  const res = await gplay.list({
    category,
    collection,
    num: limit,
  })
  // return res.map((item, i) => ({ ...item, category, collection, rank: i + 1 } as resList))
  const upgraded = res.map(async (item, i) => {
    const res: IAppItemFullDetail = await gplay.app({ appId: item.appId })
    return { ...item, category, collection, rank: i + 1, developerEmail: res.developerEmail, installs: res.maxInstalls } as resList
  })
  return Promise.all(upgraded)
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', url, headers, method, body)
  const list = await getList(body.category, body.collection, body.limit)
  // remove from list apps already in supabase
  const res: Promise<resApp>[] = list.map(item => isCapacitor(item.appId).then(res => ({ capacitor: res, ...item } as resApp)))
  const res2 = await Promise.all(res)
  // save in supabase
  await supabaseClient()
    .from('store_app')
    .insert(res2)
  return sendRes(res2)
}
// upper is ignored during netlify generation phase
// import from here
export const handler: Handler = async (event) => {
  try {
    const url: URL = new URL(event.rawUrl)
    console.log('queryStringParameters', event.queryStringParameters)
    const headers: BaseHeaders = { ...event.headers }
    const method: string = event.httpMethod
    const body: any = methodJson.includes(method) ? JSON.parse(event.body || '{}') : event.queryStringParameters
    const res = await main(url, headers, method, body)
    return res as any
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
}
