import type { RouteRecordNormalized } from 'vue-router'
import { useRouter } from 'vue-router'

export const initBlog = () => {
  const router = useRouter()
  const markdowns = router.getRoutes().reduce((acc, route) => {
    if (route.meta.frontmatter && route.path.startsWith('/blog/'))
      acc.push(route)
    return acc
  }, [] as RouteRecordNormalized[])
  return markdowns
}
