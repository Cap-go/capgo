const Buffer = require('node:buffer').Buffer
const gplay = require('google-play-scraper')
const AdmZip = require('adm-zip')

async function downloadApkPure(id) {
  const mode = 'APK'
  const downloadUrl = m => `https://d.apkpure.com/b/${m}/${id}?version=latest`
  // https://d.apkpure.com/b/APK/com.pizzahutau?version=latest
  // const responseApk = await fetch(downloadUrl, { headers })
  try {
    console.log('downloadUrl', downloadUrl(mode))
    const responseApk = await fetch(downloadUrl(mode), {
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
  catch (err) {
    console.log('NO apk', err)
    throw new Error(err)
  }
}

async function isCapacitor(id) {
  const found = {
    capacitor: false,
    cordova: false,
    react_native: false,
    capgo: false,
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
        const res = zipEntry.getData().toString('utf8')
        console.log('capacitor', res)
        found.capacitor = true
        if (res.includes('CapacitorUpdater'))
          found.capgo = true
      }
      if (zipEntry.entryName === 'res/xml/config.xml') {
        const res = zipEntry.getData().toString('utf8')
        console.log('cordova', res)
        found.cordova = true
      }
      if (zipEntry.entryName === 'res/xml/rn_dev_preferences.xml') {
        const res = zipEntry.getData().toString('utf8')
        console.log('react_native', res)
        // if ()
        found.react_native = true
      }
    })
  }
  catch (e) {
    console.log('error', id, e)
    throw new Error(e)
  }
  console.log('found', id, found)
  return found
}

async function getAppInfo(appId) {
  const item = await gplay.app({ appId })
  // return upgraded
  const insert = {
    url: item.url,
    app_id: item.appId,
    title: item.title,
    summary: item.summary,
    developer: item.developer,
    icon: item.icon,
    score: item.score,
    free: item.free,
    category: item.genre,
    developer_email: item.developerEmail,
    installs: item.maxInstalls,
    to_get_info: false,
  }
  return insert
}

async function getAppsInfo(appId) {
  const items = await gplay.similar({ appId })

  return items.map((item) => {
    const insert = {
      app_id: item.appId,
    }
    return insert
  })
}

// getAppInfo('pl.jmpolska.clos0.mojabiedronka').then((res) => {
//   console.log(res)
// })
// getAppsInfo('pl.jmpolska.clos0.mojabiedronka').then((res) => {
//   console.log(res)
// })

isCapacitor('com.clickandboat.androidphone').then((res) => {
  console.log(res)
})
// isCapacitor('pl.jmpolska.clos0.mojabiedronka').then((res) => {
//   console.log(res)
// })
// https://d.apkpure.com/b/APK/com.clickandboat.androidphone?version=latest
// https://d.apkpure.com/b/APK/com.clickandboat.androidphone?version=latest
