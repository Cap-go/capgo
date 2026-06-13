// Best-effort, conservative redaction for free-text logs before they touch disk.
// Order matters: multi-line PEM blocks first, then line-level token patterns.
const PEM_RE = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g
const PATTERNS: Array<{ re: RegExp, replace: string }> = [
  // Authorization: Bearer <token>
  { re: /(authorization\s*:\s*bearer\s+)[\w.\-+/=]+/gi, replace: '$1[REDACTED]' },
  // Capgo API keys
  { re: /\bcapg_[A-Za-z0-9]{8,}\b/g, replace: '[REDACTED]' },
  { re: /(capgkey\s*[=:]\s*)[\w-]{6,}/gi, replace: '$1[REDACTED]' },
  // generic key/secret/token/password = value
  { re: /\b(api[_-]?key|secret|token|password|passwd|pwd)(\s*[=:]\s*)["']?[\w.\-+/=]{6,}["']?/gi, replace: '$1$2[REDACTED]' },
  // JSON-style secrets dumped from raw provider (Apple App Store Connect / Google
  // Play) API error bodies, and structured props on the ASC helper's `log` lines.
  // `p8`/`pem` cover a stray private-key-bearing prop the patterns above miss; the
  // closing quote anchors the key, so `"p8Path"` (a useful, non-secret path) is
  // left intact.
  { re: /("(?:access_token|refresh_token|id_token|client_secret|private_key|apple_key_content|api[_-]?key|token|secret|password|p8|pem)"\s*:\s*")[^"]+(")/gi, replace: '$1[REDACTED]$2' },
]

export function redactSecrets(text: string): string {
  let out = text.replace(PEM_RE, '[REDACTED PRIVATE KEY]')
  for (const { re, replace } of PATTERNS)
    out = out.replace(re, replace)
  return out
}
