import { config } from 'dotenv'
import keys from '../configs.json' assert {type: 'json'}

config()

export const branch = process.env.ENV || process.env.BRANCH || 'main'
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
export function getPlansPath() {
  if (branch === 'local')
    return './generated/plans_local.json'
  else
    return './generated/plans_prod.json'
}
export const supa_url = getRightKey('supa_url')
export const supa_anon = getRightKey('supa_anon')
