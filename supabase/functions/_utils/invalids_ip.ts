import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'

const ipapi = async (ip: string, lang = 'en') => {
  ip = ip || ''
  lang = lang || 'en'

  const langs = ['en', 'de', 'es', 'pt-BR', 'fr', 'ja', 'zh-CN', 'ru']

  if (!langs.includes(lang))
    throw new Error(`unknown language, supported ones are: ${langs.join(', ')}`)

  const res = await axios(`http://ip-api.com/json/${ip}?lang=${lang}&fields=66842623`)

  return res.data
}

export const invalidIps = async (ips: string[]) => {
  // check all ip an return true if one is from google
  for (const ip of ips) {
    const res = await ipapi(ip)
    if (res.isp.toLowerCase().includes('google'))
      return true
  }
  return false
}
export const invalidIp = async (ip: string) => {
  // check all ip an return true if one is from google
  const res = await ipapi(ip)
  if (res.isp.toLowerCase().includes('google'))
    return true
  return false
}
