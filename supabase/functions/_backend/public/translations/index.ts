import { resolveLocale } from '../../../../../src/constants/locales.ts'
import { honoFactory, quickError, useCors } from '../../utils/hono.ts'
import { getLocaleMessages } from './messages.ts'

export const app = honoFactory.createApp()

app.use('*', useCors)

app.get('/:locale', (c) => {
  const locale = resolveLocale(c.req.param('locale'))
  if (!locale)
    return quickError(404, 'unsupported_locale', 'Unsupported locale')

  c.header('Cache-Control', 'public, max-age=300, s-maxage=86400')
  c.header('Content-Language', locale)
  return c.json(getLocaleMessages(locale))
})
