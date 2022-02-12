import type { Handler } from '@netlify/functions'
import { sendRes } from './../services/utils'

export const handler: Handler = async(event) => {
  console.log(event.httpMethod)
  return sendRes()
}
