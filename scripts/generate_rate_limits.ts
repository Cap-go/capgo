import fs from 'node:fs'

const regex1 = /(?<=publicRateLimiter\()'([A-Z_]+)(?:'),\s*\[(.*?)\]/g
const regex2 = /(?<=deviceAppIdRateLimiter\()'([A-Z_]+)(?:'),\s*\[(.*?)\]/g
// Regex to extract the action name (e.g. 'CHANNEL_SELF')
const actionRegex = /'([^']+)'/

const filePath = process.argv[2]
if (!filePath) {
  console.error('Please provide a file path as argument')
  process.exit(1)
}

const file = fs.readFileSync(filePath, 'utf8')
const matches1 = file.match(regex1)
const deduped1 = [...new Set(matches1 ?? [])]

const final1 = deduped1.map((match, i) => {
  // Regex to extract array elements as space-separated string (e.g. "POST DELETE PUT GET")
  const methodsRegex = /(?<=\[)[^\]]*(?=\])/g

  const methodsMatch = methodsRegex.exec(match)
  if (!methodsMatch || methodsMatch.length === 0 || methodsMatch[0] === '') {
    console.log(match, methodsMatch)
    throw new Error('No methods found')
  }

  const action = actionRegex.exec(match)?.[0].replaceAll('\'', '')
  const toEval = `[${methodsMatch?.[0]}]`
  const methods = eval(toEval) as { limit: number, period: number, method: string }[]

  return methods.map(method => `[[unsafe.bindings]]
name = "API_${action}_${method.method}_RATE_LIMITER"
type = "ratelimit"
namespace_id = "${1001 + i}"
simple = { limit = ${method.limit}, period = ${method.period} }`)
}).flat()

const matches2 = file.match(regex2)
const deduped2 = [...new Set(matches2 ?? [])]


const final2 = deduped2.map((match, i) => {
  // Regex to extract array elements as space-separated string (e.g. "POST DELETE PUT GET")
  const methodsRegex = /(?<=\[)[^\]]*(?=\])/g

  const methodsMatch = methodsRegex.exec(match)
  if (!methodsMatch || methodsMatch.length === 0 || methodsMatch[0] === '') {
    console.log(match, methodsMatch)
    throw new Error('No methods found')
  }

  const action = actionRegex.exec(match)?.[0].replaceAll('\'', '')
  const toEval = `[${methodsMatch?.[0]}]`
  const methods = eval(toEval) as { limit: number, period: number, method: string }[]

  return methods.map(method => `[[unsafe.bindings]]
name = "PUBLIC_API_DEVICE_${action}_${method.method}_RATE_LIMITER"
type = "ratelimit"
namespace_id = "${1001 + i}"
simple = { limit = ${method.limit}, period = ${method.period} }`)
}).flat()

if (final1.length > 0) {
  console.log(final1.join('\n\n'))
}
if (final2.length > 0) {
  console.log(final2.join('\n\n'))
}