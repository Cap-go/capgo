import { OpenAPIHono } from '@hono/zod-openapi'
import { getApp as get } from './get/get.ts'

export function getApp(deprecated: boolean) {
  const app = new OpenAPIHono()
  app.route('/', get(deprecated))
  return app
}
