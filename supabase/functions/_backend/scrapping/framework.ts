import type { Context } from '@hono/hono'
import AdmZip from 'adm-zip'
import { Hono } from 'hono/tiny'
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

async function isCapacitor(c: Context, id: string) {
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
    console.log({ requestId: c.get('requestId'), context: 'downloadApkPure', id })
    const buffer = await downloadApkPure(id)
    console.log({ requestId: c.get('requestId'), context: 'AdmZip', id })
    const zip = new AdmZip(buffer)
    const zipEntries = zip.getEntries() // an array of ZipEntry records
    zipEntries.forEach((zipEntry) => {
      // console.log(c.get('requestId'), 'zipEntry', zipEntry.entryName)
      if (zipEntry.entryName === 'assets/capacitor.config.json') {
        console.log({ requestId: c.get('requestId'), context: 'capacitor', id: 'assets/capacitor.config.json' })
        found.capacitor = true
        // check if updateUrl is set, means on-prem
        const res = zipEntry.getData().toString('utf8')
        if (res.includes('updateUrl'))
          found.onprem = true
      }
      if (zipEntry.entryName === 'assets/capacitor.plugins.json') {
        const res = zipEntry.getData().toString('utf8')
        console.log({ requestId: c.get('requestId'), context: 'capacitor', id: res })
        found.capacitor = true
        if (res.includes('@capgo/capacitor-updater'))
          found.capgo = true
      }
      if (zipEntry.entryName === 'res/xml/config.xml') {
        console.log({ requestId: c.get('requestId'), context: 'cordova', id: 'res/xml/config.xml' })
        found.cordova = true
      }
      if (zipEntry.entryName === 'lib/x86_64/libreactnativejni') {
        console.log({ requestId: c.get('requestId'), context: 'react_native', id: 'lib/x86_64/libreactnativejni' })
        found.react_native = true
      }
      if (zipEntry.entryName === 'kotlin/kotlin.kotlin_builtins') {
        console.log({ requestId: c.get('requestId'), context: 'kotlin', id: 'kotlin/kotlin.kotlin_builtins' })
        found.kotlin = true
      }
      if (zipEntry.entryName === 'lib/x86_64/libflutter.so') {
        console.log({ requestId: c.get('requestId'), context: 'flutter', id: 'lib/x86_64/libflutter.so' })
        found.flutter = true
      }
      if (zipEntry.entryName === 'lib/x86_64/libNativeScript.so') {
        console.log({ requestId: c.get('requestId'), context: 'native_script', id: 'lib/x86_64/libNativeScript.so' })
        found.native_script = true
      }
    })
  }
  catch (e) {
    console.log({ requestId: c.get('requestId'), context: 'error', id, error: e })
    throw new Error(e as any)
  }
  console.log({ requestId: c.get('requestId'), context: 'found', id, found })
  return found
}
async function getInfoCap(c: Context, appId: string) {
  try {
    // console.log(c.get('requestId'), 'getInfoCap', appId)
    // remove from list apps already in supabase
    const res = await isCapacitor(c, appId)
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
    console.log({ requestId: c.get('requestId'), context: 'getInfoCap', id: appId, res })
  }
  catch (e) {
    console.log({ requestId: c.get('requestId'), context: 'error getInfoCap', error: e })
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
      console.log({ requestId: c.get('requestId'), context: 'cannot get apps', body })
      return c.json({ status: 'Error', error: 'cannot get apps' }, 500)
    }
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot parse framework', error: JSON.stringify(e) }, 500)
  }
})
