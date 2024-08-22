import { env } from 'node:process'
import { config } from 'dotenv'
import keys from '../configs.json'

config()

export const branch = env.ENV || env.BRANCH || 'main'
console.log('Branch', branch)

export function getRightKey(keyname) {
  // console.log('getRightKey', branch, keyname)
  if (!keys || !keys[keyname])
    return ''
  if (branch === 'development')
    return keys[keyname].development
  else if (branch === 'local')
    return keys[keyname].local
  return keys[keyname].prod
}
export const supa_url = getRightKey('supa_url')
export const supa_anon = getRightKey('supa_anon')
