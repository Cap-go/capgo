import sanitizeHtml from 'sanitize-html'

export function sanitizeText(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    parser: { decodeEntities: true },
  }).trim()
}

export function sanitizeOptionalText(value?: string | null) {
  if (value === undefined || value === null)
    return value
  return sanitizeText(value)
}
