import AdmZip from 'adm-zip'
import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { saveStoreInfoCF } from '../utils/cloudflare.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'

export const app = new Hono()

interface AppInfo {
  appId?: string
  appIds?: string[]
}

async function downloadApkPure(id: string, mode: 'APK' | 'XAPK' = 'APK') {
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
  // eslint-disable-next-line node/prefer-global/buffer
  const buffer = Buffer.from(arrayBuffer)
  return buffer
}

async function isCapacitor(id: string) {
  const found = {
    capacitor: false,
    cordova: false,
    react_native: false,
    native_script: false,
    capgo: false,
    onprem: false,
    kotlin: false,
    flutter: false,
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
        console.log('capacitor', 'assets/capacitor.config.json')
        found.capacitor = true
        // check if updateUrl is set, means on-prem
        const res = zipEntry.getData().toString('utf8')
        if (res.includes('updateUrl'))
          found.onprem = true
      }
      if (zipEntry.entryName === 'assets/capacitor.plugins.json') {
        const res = zipEntry.getData().toString('utf8')
        console.log('capacitor', res)
        found.capacitor = true
        if (res.includes('@capgo/capacitor-updater'))
          found.capgo = true
      }
      if (zipEntry.entryName === 'res/xml/config.xml') {
        console.log('cordova', 'res/xml/config.xml')
        found.cordova = true
      }
      if (zipEntry.entryName === 'lib/x86_64/libreactnativejni') {
        console.log('react_native', 'lib/x86_64/libreactnativejni')
        found.react_native = true
      }
      if (zipEntry.entryName === 'kotlin/kotlin.kotlin_builtins') {
        console.log('kotlin', 'kotlin/kotlin.kotlin_builtins')
        found.kotlin = true
      }
      if (zipEntry.entryName === 'lib/x86_64/libflutter.so') {
        console.log('flutter', 'lib/x86_64/libflutter.so')
        found.flutter = true
      }
      if (zipEntry.entryName === 'lib/x86_64/libNativeScript.so') {
        console.log('native_script', 'lib/x86_64/libNativeScript.so')
        found.native_script = true
      }
    })
  }
  catch (e) {
    console.log('error', id, e)
    throw new Error(e as any)
  }
  console.log('found', id, found)
  return found
}
async function getInfoCap(c: Context, appId: string) {
  try {
    // console.log('getInfoCap', appId)
    // remove from list apps already in supabase
    const res = await isCapacitor(appId)
    // save in supabase
    await saveStoreInfoCF(c, {
      app_id: appId,
      capacitor: res.capacitor,
      cordova: res.cordova,
      react_native: res.react_native,
      capgo: res.capgo,
      onprem: res.onprem,
      kotlin: res.kotlin,
      native_script: res.native_script,
      flutter: res.flutter,
      to_get_framework: false,
    })
    console.log('getInfoCap', appId, res)
  }
  catch (e) {
    console.log('error getInfoCap', e)
    await saveStoreInfoCF(c, {
      app_id: appId,
      to_get_framework: false,
    })
  }
}

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<AppInfo>()
    if (body.appId) {
      await getInfoCap(c, body.appId)
    }
    else if (body.appIds) {
      const all = []
      for (const appId of body.appIds)
        all.push(getInfoCap(c, appId))
      await Promise.all(all)
    }
    else {
      console.log('cannot get apps', body)
      return c.json({ status: 'Error', error: 'cannot get apps' }, 500)
    }
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot parse framework', error: JSON.stringify(e) }, 500)
  }
})
