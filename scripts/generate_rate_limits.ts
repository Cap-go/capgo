import fs from 'fs'

const regex = /(?<=publicRateLimiter\(')[A-Z_]+(?:GET|POST|DELETE)(?=')/g

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

console.log(final.join('\n\n'))
