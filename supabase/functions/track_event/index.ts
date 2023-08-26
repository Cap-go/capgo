import { serve } from 'https://deno.land/std@0.199.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { sendOptionsRes, sendRes } from '../_utils/utils.ts'

import { LogSnag, PublishOptions } from 'https://cdn.logsnag.com/deno/0.1.8/index.ts';
import { getEnv } from "../_utils/utils.ts";

interface Body {
    payload: PublishOptions
    apiKey: string
}

serve(async (request: Request) => {
    if (request.method === 'OPTIONS')
        return sendOptionsRes()

    try {
        const { payload, apiKey } = await request.json() as Body

        const data = await supabaseAdmin()
            .from('apikeys')
            .select()
            .eq('key', apiKey)
            .single()

        if (data.error) {
            return sendRes({ status: 'failed', message: 'Unauthorized' }, 400)
        }

        const logsnag = new LogSnag({
            token: getEnv('LOGSNAG_TOKEN'),
            project: getEnv('LOGSNAG_PROJECT'),
        })

        await logsnag.publish({
            ...payload
        })
        return sendRes({ status: 'success', message: 'Event logged' }, 200)

    } catch (error) {
        console.log(error);
        
        return sendRes({ status: 'failed', message: (error as Error).message }, 400)
    }
})