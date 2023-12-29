import { getEnv, methodJson, sendRes, setEnv } from "./cloudflare_utils/utils.ts";
import { BaseHeaders } from "./cloudflare_utils/types.ts";
import { WorkerEnv } from "./worker_env.d.ts";

export interface DBPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: any | null
  old_record: null | any
}

async function main(url: URL, headers: BaseHeaders, method: string, body: DBPayload, env: WorkerEnv) {
  const API_SECRET = getEnv('API_SECRET_ENV');
  const authorizationSecret = headers['authorization'];
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    return sendRes({ status: 'Fail Authorization' }, 400);
  }

  try {
    const record = body.record;
    console.log('record', record);
    let query = '';

    if (body.type === 'INSERT' || body.type === 'UPDATE') {
      const columns = Object.keys(record).join(', ');
      const values = Object.values(record).map(val => `'${val}'`).join(', ');
      const setString = Object.entries(record).map(([key, val]) => `${key} = EXCLUDED.${key}`).join(', ');

      // UPSERT query (INSERT ... ON CONFLICT)
      query = `INSERT INTO public.${body.table} (${columns}) VALUES (${values}) ON CONFLICT (id) DO UPDATE SET ${setString};`;
      await env.capgo_db.exec(query);
    } else if (body.type === 'DELETE') {
      query = `DELETE FROM public.${body.table} WHERE id='${record.id}';`;
      await env.capgo_db.exec(query);
    } else {
      return sendRes({ status: 'Fail Type' }, 400);
    }

    // No data is returned, just a success response
    return sendRes({ status: 'Success' }, 200);
  } catch (e) {
    console.error('error', e);
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500);
  }
}



export default {
  async fetch(request: Request, env: WorkerEnv) {
    setEnv(env)

    const url: URL = new URL(request.url)
    const headers: BaseHeaders = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })
    const method: string = request.method
    const body: any = methodJson.includes(method) ? await request.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body, env)
  },
}
