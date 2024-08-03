import { OpenAPIHono } from '@hono/zod-openapi'
import { getApp as get } from './get/get.ts'
import { postApp } from './post/post.ts'
import { deleteApp } from './delete/delete.ts'

export function getApp(deprecated: boolean) {
  const app = new OpenAPIHono()
  app.route('/', get(deprecated))
  app.route('/', deleteApp(deprecated))
  app.route('/', postApp(deprecated))
  return app
}
