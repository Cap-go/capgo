import { exec as execCb } from 'child_process'
import util from 'util'
import { supa_url } from './utils.mjs'

const exec = util.promisify(execCb)
const supaId = supa_url.split('//')[1].split('.')[0]
const command = `npx --yes supabase gen types typescript --project-id=${supaId} > src/types/supabase.types.ts`

const main = async () => {
  try {
    const { stderr } = await exec(command)
    if (stderr)
      console.error(stderr)
    else
      console.log('Type generated ✅')
  }
  catch (e) {
    console.error(e) // should contain code (exit code) and signal (that caused the termination).
  }
  try {
    const { stderr: err } = await exec('cp src/types/supabase.types.ts supabase/functions/_utils/supabase.types.ts')
    if (err)
      console.error(err)
    else
      console.log('Copy done ✅')
  }
  catch (e) {
    console.error(e) // should contain code (exit code) and signal (that caused the termination).
  }
}
main()
