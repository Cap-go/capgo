import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { getEnv } from './utils.ts'

function getAuth() {
  // get crisp token
  const CRISP_TOKEN_ID = getEnv('CRISP_TOKEN_ID')
  const CRISP_TOKEN_SECRET = getEnv('CRISP_TOKEN_SECRET')
  const CRISP_TOKEN = `${CRISP_TOKEN_ID}:${CRISP_TOKEN_SECRET}`
  // encode b64
  const CRISP_TOKEN_B64 = btoa(CRISP_TOKEN)
  return `Basic ${CRISP_TOKEN_B64}`
}
function getConfig() {
  return {
    headers: {
      'Authorization': getAuth(),
      'X-Crisp-Tier': 'plugin',
    },
  }
}
function baseUrl() {
  const CRISP_ID = getEnv('CRISP_ID') || ''
  const url = `https://api.crisp.chat/v1/website/${CRISP_ID}`
  return url
}

export async function postPerson(email: string, firstName?: string, lastName?: string, avatar?: string) {
  const url = `${baseUrl()}/people/profile`
  const response = await axios.post(url, {
    email,
    person: {
      nickname: `${firstName} ${lastName}`,
      avatar,
    },
  }, getConfig())
  return response.data
}
export interface Person {
  nickname?: string
  avatar?: string
  status?: string
  country?: string
  id?: string
  customer_id?: string
  product_id?: string
  price_id?: string
  [key: string]: string | undefined
}

export async function updatePerson(email: string, person?: Person, segments: string[] = []) {
  const url = `${baseUrl()}/people/profile/${email}`
  const response = await axios.patch(url, {
    email,
    person,
    segments,
  }, getConfig())
  return response.data
}

export async function addDataPerson(email: string, data: Person) {
  const url = `${baseUrl()}/people/data/${email}`
  const response = await axios.patch(url, { data }, getConfig())
  return response.data
}

export async function setDataPerson(email: string, data: Person) {
  const url = `${baseUrl()}/people/data/${email}`
  console.log('setDataPerson', data)
  const response = await axios.put(url, { data }, getConfig())
  return response.data
}

export async function getDataPerson(email: string): Promise<{ [key: string]: string }> {
  const url = `${baseUrl()}/people/data/${email}`
  const response = await axios.get(url, getConfig())
  console.log('getDataPerson', response?.data?.data?.data)
  return response?.data?.data?.data || {}
}

export async function deleteDataPerson(email: string, data: Person) {
  const current = await getDataPerson(email)
  const currentKeys = Object.keys(current)
  // check if keys exist in current
  const newData: any = { }
  let found = false
  currentKeys.forEach((key) => {
    if (!data[key])
      newData[key] = current[key]
    else
      found = true
  })
  if (!found)
    return
  console.log('deleteDataPerson', newData)
  return setDataPerson(email, newData)
}

export async function addEventPerson(email: string, data: any, text: string, color: string) {
  const url = `${baseUrl()}/people/events/${email}`
  const response = await axios.post(url, {
    text,
    data,
    color,
  }, getConfig())
  return response.data
}
