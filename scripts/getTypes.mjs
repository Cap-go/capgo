import { exec as execCb } from 'node:child_process'
import util from 'node:util'
import { supa_url } from './utils.mjs'

const exec = util.promisify(execCb)
const supaId = supa_url.split('//')[1].split('.')[0]
const command = `pnpm dlx supabase@latest gen types typescript --project-id=${supaId} > src/types/supabase.types.ts`

async function main() {
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
