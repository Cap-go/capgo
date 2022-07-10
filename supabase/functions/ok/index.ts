import { serve } from 'https://deno.land/std@0.147.0/http/server.ts'
import { sendRes } from '../_utils/utils.ts'

serve(async (event: Request) => {
  console.log('Current Deno version', Deno.version.deno)
  console.log('Current TypeScript version', Deno.version.typescript)
  console.log('Current V8 version', Deno.version.v8)
  try {
    console.log('body', await event.json())
    return sendRes()
  }
  catch (e) {
    console.error('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
