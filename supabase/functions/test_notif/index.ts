import { serve } from 'https://deno.land/std@0.165.0/http/server.ts'
import { sendNotif } from '../_utils/notifications.ts'
import { sendRes } from '../_utils/utils.ts'

interface AppStats {
  event: string
  user_id: string
}

serve(async (event: Request) => {
  try {
    const body = (await event.json()) as AppStats
    sendNotif(body.event, body.user_id, '* * * * *', 'red')
    return sendRes()
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
