const AdmZip = require('adm-zip')
const apk = require('apkmirror.js')
const gplay = require('google-play-scraper')

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36',
}

const isCapacitor = async (id) => {
  let found = false

  try {
    const res = await apk.getPackages([id])
    const pageHome = `https://www.apkmirror.com${res[0].apks[0].link}`
    //   console.log('pageHome', pageHome)
    const response = await fetch(pageHome, { headers })
    const resTxt = await response.text()
    const matchKey = resTxt.match(/\?key=(.*)"/)
    const pageDownload = `${pageHome}download/?key=${matchKey[1]}`
    //   console.log('pageDownload', pageDownload)
    const responseDownload = await fetch(pageDownload, { headers })
    const resTxtresponseDownload = await responseDownload.text()
    const matchResponseDownload = resTxtresponseDownload.match(/\/download\.php\?(.*)"/)
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
      if (zipEntry.entryName == 'assets/capacitor.config.json') {
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

const getList = async () => {
  const res = await gplay.list({
    category: gplay.category.APPLICATION,
    collection: gplay.collection.TOP_FREE,
    num: 100,
    start: 0,
  })
  const list = res.map(item => item.appId)
  console.log('list', list)
  return list
}

const main = async () => {
  const list = await getList()
  for (let i = 0; i < list.length; i++) {
    const id = list[i]
    const isCap = await isCapacitor(id)
    // if (isCap)
    console.log('app', id, isCap)
  }
}
main()
