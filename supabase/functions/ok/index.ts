import { serve } from 'https://deno.land/std@0.145.0/http/server.ts'
import { sendRes } from '../_utils/utils.ts'

interface dataDemo {
  appid: string
  name: string
  icon: string
  iconType: string
}

serve(async (event: Request) => {
  try {
    const body = (await event.json()) as dataDemo
    console.log('body', body)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
