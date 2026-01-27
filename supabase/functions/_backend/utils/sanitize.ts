import { decode } from 'entities'
import sanitizeHtml from 'sanitize-html'

export function sanitizeText(value: string) {
  const sanitized = sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    parser: { decodeEntities: true },
  })
  return decode(sanitized).trim()
}

export function sanitizeOptionalText(value?: string | null) {
  if (value === undefined || value === null)
    return value
  return sanitizeText(value)
}
