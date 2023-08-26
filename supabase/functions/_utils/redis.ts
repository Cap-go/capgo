export function parseRedisUrl(url: string): { hostname: string; password: string | undefined; port: string; name: string | undefined } {
  url = url.replace('redis://', '')
  const splitted = url.split(':')
  if (splitted.length !== 3)
    throw new Error('Cannot parse redis url')

  const splittedPassword = splitted[1].split('@')
  if (splittedPassword.length !== 2)
    throw new Error('Cannot parse redis url (password)')

  const parsed = {
    hostname: splittedPassword[1],
    password: splittedPassword[0] === 'default' ? undefined : splittedPassword[0],
    port: splitted[2],
    name: splitted[0] === 'default' ? undefined : splitted[0],
  }

  console.log(JSON.stringify(parsed))

  return parsed
}
