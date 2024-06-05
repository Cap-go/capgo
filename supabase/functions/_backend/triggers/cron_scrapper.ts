import ky from 'ky'
import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { categories } from '../utils/gplay_categ.ts'
import { getAppsToProcessCF } from '../utils/cloudflare.ts'

const toGetFramwork = 500
const toGetInfo = 500
const toGetSimilar = 5000
const baseApi = 'https://netlify.capgo.app'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const API_SECRET = c.get('APISecret')
    const options = {
      headers: {
        apisecret: API_SECRET,
      },
    }
    const appsToGetFramework = await getAppsToProcessCF(c, 'to_get_framework', toGetFramwork)

    const appsToGetInfo = await getAppsToProcessCF(c, 'to_get_info', toGetInfo)

    const appsToGetSimilar = await getAppsToProcessCF(c, 'to_get_similar', toGetSimilar)

    const all = []
    const pageSize = 10
    const pageSizeLittle = 2
    console.log('appsToGetFramework', appsToGetFramework?.length || 0)
    console.log('appsToGetInfo', appsToGetInfo?.length || 0)
    console.log('appsToGetSimilar', appsToGetSimilar?.length || 0)
    console.log('appsToGetTop categories', categories?.length || 0)
    console.log('appsToGetTop total', (categories?.length || 0))
    console.log('appsToGetTop total result', (categories?.length || 0) * 500)
    // split countries by 10 to batch send to netlify
    for (let i = 0; i < categories.length; i++) {
      console.log('category', categories[i])
      all.push(ky.post(`${baseApi}/get_top_apk-background`, {
        json: {
          category: categories[i],
        },
        ...options,
      }))
    }
    if (appsToGetFramework?.length) {
      for (let i = 0; i < appsToGetFramework.length; i += pageSizeLittle) {
        const appsBatch = appsToGetFramework.slice(i, i + pageSizeLittle)
        all.push(ky.post(`${baseApi}/get_framework-background`, {
          json: {
            appIds: appsBatch.map(app => app.app_id),
          },
          ...options,
        }))
      }
    }
    if (appsToGetInfo?.length) {
      for (let i = 0; i < appsToGetInfo.length; i++) {
        all.push(ky.post(`${baseApi}/get_store_info-background`, {
          json: {
            appId: appsToGetInfo[i],
          },
          ...options,
        }))
      }
    }
    if (appsToGetSimilar?.length) {
      for (let i = 0; i < appsToGetSimilar.length; i += pageSize) {
        const appsSimilarBatch = appsToGetSimilar.slice(i, i + pageSize)
        // all.push(ky.post('https://netlify.capgo.app/get_framework-background', {
        //   appIds: appsSimilarBatch.map(app => app.app_id),
        // }))
        console.log('appsSimilarBatch', appsSimilarBatch.length)
        all.push(ky.post(`${baseApi}/get_similar_app-background`, {
          json: {
            appIds: appsSimilarBatch.map(app => app.app_id),
          },
          ...options,
        }))
      }
    }
    await Promise.all(all)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot process scrapper', error: JSON.stringify(e) }, 500)
  }
})
