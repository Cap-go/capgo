export function isPrivateIpv4(ip: string) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    return true
  }

  const octets = ip.split('.').map(part => Number.parseInt(part, 10))
  if (octets.some(part => Number.isNaN(part) || part < 0 || part > 255)) {
    return true
  }

  const [a, b, c] = octets
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 192 && b === 88 && octets[2] === 99)
    || a >= 224
    // Reserved TEST-NET ranges are also non-public for server-side fetch paths.
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && octets[2] === 2)
    || (a === 198 && b === 51 && octets[2] === 100)
    || (a === 203 && b === 0 && octets[2] === 113)
}

export function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '::') {
    return true
  }
  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalizeMappedIpv4(normalized.slice(7))
    return isPrivateIpv4(mappedIpv4)
  }

  const hextets = parseIpv6Hextets(normalized)
  if (!hextets) {
    return true
  }

  const [firstHextet, secondHextet] = hextets
  if (
    (firstHextet & 0xFFC0) === 0xFE80
    || (firstHextet & 0xFFC0) === 0xFEC0
    || (firstHextet & 0xFE00) === 0xFC00
    || (firstHextet & 0xFF00) === 0xFF00
    || firstHextet === 0x2002
    || (firstHextet === 0x2001 && secondHextet === 0x0DB8)
    || (firstHextet === 0x2001 && secondHextet === 0x0002)
    || (firstHextet === 0x2001 && (secondHextet & 0xFFF0) === 0x0010)
  ) {
    return true
  }
  return false
}

export function isPrivateIp(ip: string) {
  return ip.includes(':') ? isPrivateIpv6(ip) : isPrivateIpv4(ip)
}

function normalizeMappedIpv4(value: string) {
  if (value.includes('.')) {
    return value
  }

  const parts = value.split(':')
  if (parts.length !== 2) {
    return value
  }

  const [high, low] = parts.map(part => Number.parseInt(part, 16))
  if (
    !Number.isFinite(high)
    || !Number.isFinite(low)
    || high < 0
    || high > 0xFFFF
    || low < 0
    || low > 0xFFFF
  ) {
    return value
  }

  return [
    high >> 8,
    high & 0xFF,
    low >> 8,
    low & 0xFF,
  ].join('.')
}

function parseIpv6Hextets(value: string) {
  if (value.includes('.')) {
    return null
  }

  const compressed = value.split('::')
  if (compressed.length > 2) {
    return null
  }

  const [left, right = ''] = compressed
  const leftParts = left ? left.split(':') : []
  const rightParts = right ? right.split(':') : []
  const explicitParts = [...leftParts, ...rightParts]
  if (explicitParts.some(part => !/^[\da-f]{1,4}$/.test(part))) {
    return null
  }

  const missingCount = 8 - explicitParts.length
  if (compressed.length === 1 && missingCount !== 0) {
    return null
  }
  if (compressed.length === 2 && missingCount < 1) {
    return null
  }

  return [
    ...leftParts,
    ...(Array.from({ length: compressed.length === 2 ? missingCount : 0 }).fill('0') as string[]),
    ...rightParts,
  ].map(part => Number.parseInt(part, 16))
}
