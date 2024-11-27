import fs from 'fs'

const regex = /(?<=publicRateLimiter\(')[A-Z_]+(?:GET|POST|DELETE)(?=')/g
const regex2 = /(?<=deviceAppIdRateLimiter\()'([A-Z_]+)(?:'),\s*\[(.*?)\]/g
// Regex to extract the action name (e.g. 'CHANNEL_SELF')
const actionRegex = /'([^']+)'/

// Regex to extract array elements as space-separated string (e.g. "POST DELETE PUT GET")
const methodsRegex = /(?<=\[)[^\]]*(?=\])/g



const filePath = process.argv[2]
if (!filePath) {
  console.error('Please provide a file path as argument')
  process.exit(1)
}

const file = fs.readFileSync(filePath, 'utf8')
const matches = file.match(regex)

const final = (matches ?? []).map((match, i) => {
  return `[[unsafe.bindings]]
name = "API_${match}_RATE_LIMITER"
type = "ratelimit"
namespace_id = "${1001 + i}"
simple = { limit = 20, period = 10 }`
})

const matches2 = file.match(regex2)
const deduped = [...new Set(matches2 ?? [])]


const final2 = deduped.map((match, i) => {
  const methods = methodsRegex.exec(match)?.[0].toString().replace(/[',\s]+/g, ' ').trim().replace('\'', '').split(' ') ?? []
  const action = actionRegex.exec(match)?.[0].replaceAll('\'', '')

  return methods.map(method => `[[unsafe.bindings]]
name = "PUBLIC_DEVICE_APP_ID_${action}_${method}_RATE_LIMITER"
type = "ratelimit"
namespace_id = "${1001 + i}"
simple = { limit = 20, period = 10 }`)
}).flat()

console.log(final.join('\n\n'))
console.log(final2.join('\n\n'))