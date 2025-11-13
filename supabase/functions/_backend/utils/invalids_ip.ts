async function ipapi(ip: string, lang = 'en') {
  ip = ip ?? ''
  lang = lang ?? 'en'

  const langs = ['en', 'de', 'es', 'pt-BR', 'fr', 'ja', 'zh-CN', 'ru']

  if (!langs.includes(lang))
    throw new Error(`unknown language, supported ones are: ${langs.join(', ')}`)

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?lang=${lang}&fields=66842623`)

    if (!response.ok) {
      await response.text() // Consume body to prevent resource leak
      throw new Error(`ipapi error: HTTP ${response.status}`)
    }

    return await response.json() as { isp: string }
  }
  catch (e) {
    throw new Error(`ipapi error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export async function invalidIps(ips: string[]) {
  // check all ip an return true if one is from google
  for (const ip of ips) {
    const res = await ipapi(ip)
    if (res.isp.toLowerCase().includes('google'))
      return true
  }
  return false
}
export async function invalidIp(ip: string) {
  // check all ip an return true if one is from google
  const res = await ipapi(ip)
  if (res.isp.toLowerCase().includes('google'))
    return true
  return false
}
