import type { RouteRecordNormalized } from 'vue-router'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'

export interface Frontmatter {
  title: string
  date: string
  description: string
  tag: string
  author: string
  published: boolean
  head_image: string
  head_image_alt: string
  next_blog?: string
}
export interface Route extends RouteRecordNormalized {
  meta: {
    frontmatter: Frontmatter
  }
}

export const initBlog = (): Route[] => {
  const router = useRouter()
  const blogs = router.getRoutes().reduce((acc, route) => {
    const frontmatter = route.meta.frontmatter as Frontmatter
    if (frontmatter && route.path.startsWith('/blog/') && frontmatter.published)
      acc.push(route as Route)
    return acc
  }, [] as Route[])
  blogs.sort((a, b) => { return dayjs(b.meta.frontmatter.date).valueOf() - dayjs(a.meta.frontmatter.date).valueOf() })
  return blogs
}

export const randomBlog = (path: string, nextBlog = 'undefined'): Route => {
  const blogs = initBlog()

  const filtered = blogs.filter(blog => blog.path !== path)
  const nextBlogRoute = blogs.find(blog => blog.path === nextBlog)
  if (nextBlogRoute)
    return nextBlogRoute
  const blog = filtered[Math.floor(Math.random() * filtered.length)]
  return blog
}

export const stringToDate = (date: string) => {
  return dayjs(date).format('MMMM DD, YYYY')
}
