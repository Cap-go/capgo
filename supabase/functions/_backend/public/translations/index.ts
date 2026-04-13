import { resolveLocale } from '../../../../../src/constants/locales.ts'
import { honoFactory, quickError, useCors } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { getLocaleMessages } from './messages.ts'

export const app = honoFactory.createApp()

app.use('*', useCors)

app.get('/:locale', async (c) => {
  const requestId = c.get('requestId')
  const requestedLocale = c.req.param('locale')
  const locale = resolveLocale(requestedLocale)

  cloudlog({ requestId, message: 'translations request', requestedLocale, locale })

  if (!locale) {
    cloudlog({ requestId, message: 'translations unsupported locale', requestedLocale })
    return quickError(404, 'unsupported_locale', 'Unsupported locale')
  }

  c.header('Cache-Control', 'public, max-age=300, s-maxage=86400')
  c.header('Content-Language', locale)
  cloudlog({ requestId, message: 'translations response', locale })
  return c.json(await getLocaleMessages(locale))
})
