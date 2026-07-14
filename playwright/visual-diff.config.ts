export interface VisualDiffRoute {
  slug: string
  path: string
  /** When true, logs in as test@capgo.app before visiting the route. */
  auth?: boolean
}

/**
 * Console pages captured for before/after visual diffs.
 * Add routes here when a PR touches a new screen reviewers should compare.
 */
export const visualDiffRoutes: VisualDiffRoute[] = [
  { slug: 'login', path: '/login/', auth: false },
  { slug: 'dashboard', path: '/dashboard', auth: true },
  { slug: 'apps', path: '/apps', auth: true },
  { slug: 'app-overview', path: '/app/com.demo.app', auth: true },
  { slug: 'channels', path: '/app/com.demo.app/channels', auth: true },
  { slug: 'devices', path: '/app/com.demo.app/devices', auth: true },
  { slug: 'observe', path: '/app/com.demo.app/observe', auth: true },
]

export const visualDiffViewport = {
  width: 1280,
  height: 720,
} as const
