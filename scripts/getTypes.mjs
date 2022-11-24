import { exec as execCb } from 'child_process'
import util from 'util'
import { supa_anon, supa_url } from './utils.mjs'

const exec = util.promisify(execCb)
const url = `${supa_url}/rest/v1/\?apikey\=${supa_anon}`
const command = `npx openapi-typescript@5 ${url} --output src/types/supabase.ts`

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
    const { stderr: err } = await exec('cp src/types/supabase.ts supabase/functions/_utils/types_supabase.ts')
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
