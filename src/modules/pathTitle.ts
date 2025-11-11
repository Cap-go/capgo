import type { BreadcrumbItem } from '~/stores/display'
import type { UserModule } from '~/types'
import { useDisplayStore } from '~/stores/display'

function getPrettyName(segment: string, index: number, allSegments: string[]): string {
  const previousSegment = allSegments[index - 1]

  // If this segment comes after 'p', it's an appId - return as is
  if (previousSegment === 'p') {
    return segment
  }

  switch (segment) {
    case 'dashboard':
      return 'dashboard'
    case 'app':
      return 'apps'
    case 'settings':
      return 'settings'
    case 'organization':
      return 'organization'
    case 'onboarding':
      return 'onboarding'
    case 'channel':
      return 'channels'
    case 'bundle':
      return 'bundles'
    case 'device':
      return 'devices'
    case 'changepassword':
      return 'password'
    case 'account':
      return 'account'
    case 'notifications':
      return 'notifications'
    default:
      return segment.charAt(0).toUpperCase() + segment.slice(1)
  }
}

function isValidClickableSegment(segment: string, index: number, totalLength: number, allSegments: string[]): boolean {
  // Don't make the last segment clickable (usually an ID or final page)
  if (index === totalLength - 1)
    return false

  // Skip 'app', 'p', and 'settings' segments - they're not clickable
  if (segment === 'p' || segment === 'settings')
    return false

  const previousSegment = allSegments.length ? allSegments[index - 1] : undefined
  const previousTwoSegments = allSegments.length > 1 ? allSegments[index - 2] : undefined

  // Include 'app' only if followed by 'p' and an appId
  if (segment === 'app' && previousSegment !== 'p')
    return true

  // Include appId (segment after 'p') only if there are more segments after it
  if (previousSegment === 'p' && previousTwoSegments === 'app' && index < totalLength - 1) {
    return true
  }

  // Include organization when it's under settings and has sub-paths
  if (segment === 'organization' && previousSegment === 'settings' && index < totalLength - 1) {
    return true
  }

  // Skip other route segments that shouldn't be clickable
  const nonClickableSegments = ['channel', 'bundle', 'device', 'onboarding']
  if (nonClickableSegments.includes(segment))
    return false

  return false
}

export const install: UserModule = ({ router }) => {
  router.beforeEach(async (to) => {
    const display = useDisplayStore()

    const splitPath = to.path.split('/').filter(Boolean)

    // Handle special case for account-related settings
    if (splitPath.length === 2 && splitPath[0] === 'settings' && (splitPath[1] === 'changepassword' || splitPath[1] === 'notifications')) {
      display.pathTitle = [{
        path: '/settings/account',
        name: 'account',
      }]
    }
    else {
      display.pathTitle = splitPath
        .reduce((acc, segment, i) => {
          // Only add clickable segments
          const isValid = isValidClickableSegment(segment, i, splitPath.length, splitPath)
          if (isValid) {
            // Build the path up to this segment
            const pathUpToHere = `/${splitPath.slice(0, i + 1).join('/')}`

            // Get pretty name for the segment
            const prettyName = getPrettyName(segment, i, splitPath)

            acc.push({
              path: pathUpToHere,
              name: prettyName,
            })
          }

          return acc
        }, [] as BreadcrumbItem[])
    }

    if (to.path === '/') {
      display.pathTitle = []
    }
  })
}
