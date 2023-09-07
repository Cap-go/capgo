import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import { checkAppOwner, supabaseAdmin } from "../_utils/supabase.ts";
import {
  checkKey,
  methodJson,
  sendRes,
} from "../_utils/utils.ts";
import { getBundleUrl } from "../_utils/downloadUrl.ts";
import { Database } from "../_utils/supabase.types.ts";
import { BaseHeaders } from "../_utils/types.ts";

interface DataDownload {
  app_id: string;
}

async function main(
  url: URL,
  headers: BaseHeaders,
  method: string,
  body: DataDownload,
) {
  const apikey_string = headers.capgkey;
  if (!apikey_string) {
    return sendRes({ status: "Missing apikey" }, 400);
  }

  const apikey: Database["public"]["Tables"]["apikeys"]["Row"] | null =
    await checkKey(apikey_string, supabaseAdmin(), ["all", "write", "upload"]);
  if (!apikey) {
    return sendRes({ status: "Missing apikey" }, 400);
  }

  // if (!(await checkAppOwner(apikey.user_id, body.app_id))) {
  //   return sendRes(
  //     { status: "You can't access this app", app_id: body.app_id },
  //     400,
  //   );
  // }

  try {
    console.log(body, "BODY");

    const { data, error } = await supabaseAdmin()
      .from('app_versions')
      .select('*')
      .eq('app_id', body.app_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    console.log(data);
    if (data === null) {
      return sendRes({ status: "Error unknow" }, 500);
    }
    const url = await getBundleUrl(
      data.storage_provider,
      `apps/${data.user_id}/${data.app_id}/versions`,
      data.bucket_id!,
    );
    if (!url) {
      return sendRes({ status: "Error unknow", error: 'Bundle not found' }, 500);
    }
    return sendRes({ url: url });
  } catch (e) {
    return sendRes({
      status: "Error unknow",
      error: JSON.stringify(e),
    }, 500);
  }
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})

