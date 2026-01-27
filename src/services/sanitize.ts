import DOMPurify from 'dompurify'

export function sanitizeText(value: string) {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  }).trim()
}
