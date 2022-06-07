const util = require('util');
const exec = util.promisify(require('child_process').exec);
const keys = require('./configs.json')
require('dotenv').config()

const getRightKey = (branch, keyname) => {
  if (branch === 'local')
    return keys[keyname].development
  else if (branch === 'development')
    return keys[keyname].development
  return keys[keyname].prod
}
const supa_url = getRightKey(process.env.BRANCH || 'prod', 'supa_url')
const supa_anon = getRightKey(process.env.BRANCH || 'prod', 'supa_anon')
const url = `${supa_url}/rest/v1/\?apikey\=${supa_anon}`
const command = `npx openapi-typescript ${url} --output src/types/supabase.ts`

const main = async () => {
  try {
    const { stderr } = await exec(command);
    if (stderr)
      console.error(stderr);
    else
      console.log('Type generated ✅');
  } catch (e) {
    console.error(e); // should contain code (exit code) and signal (that caused the termination).
  }
  try {
    const { stderr: err } = await exec('cp src/types/supabase.ts supabase/functions/_utils/types_supabase.ts');
    if (err)
      console.error(err);
    else
      console.log('Copy done ✅');
  } catch (e) {
    console.error(e); // should contain code (exit code) and signal (that caused the termination).
  }
}
main()