import { serve } from 'https://deno.land/std@0.140.0/http/server.ts'
import { updatePerson } from "../_utils/crisp.ts";
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
serve(async(event: Request) => {
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.error('Fail Authorization')
    return sendRes({ message: 'Fail Authorization' }, 400)
  }
  try {
    console.log('body')
    const body = (await event.json()) as { record: definitions['users'] }
    const record = body.record
    console.log('updatePerson crisp')
    const person = {
      nickname: `${record.first_name} ${record.last_name}`,
      avatar: record.image_url ? record.image_url : undefined,
      country: record.country ? record.country : undefined,
  }
    await updatePerson(record.email, person)
    return sendRes()
  }
  catch (e) {
    console.log('e', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
