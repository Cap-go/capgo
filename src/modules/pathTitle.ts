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
  if (segment === 'app' || segment === 'p' || segment === 'settings')
    return false

  const previousSegment = allSegments[index - 1]
  const previousTwoSegments = allSegments[index - 2]

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

    const splittedPath = to.path.split('/').filter(Boolean)

    // Handle special case for account-related settings
    if (splittedPath.length === 2 && splittedPath[0] === 'settings' && (splittedPath[1] === 'changepassword' || splittedPath[1] === 'notifications')) {
      display.pathTitle = [{
        path: '/settings/account',
        name: 'account',
      }]
    }
    else {
      display.pathTitle = splittedPath
        .reduce((acc, segment, i) => {
          // Only add clickable segments
          if (isValidClickableSegment(segment, i, splittedPath.length, splittedPath)) {
            // Build the path up to this segment
            const pathUpToHere = `/${splittedPath.slice(0, i + 1).join('/')}`

            // Get pretty name for the segment
            const prettyName = getPrettyName(segment, i, splittedPath)

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
