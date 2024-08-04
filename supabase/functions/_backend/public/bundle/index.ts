import { OpenAPIHono } from '@hono/zod-openapi'
import { app as get } from './get/get.ts'
import { app as deleteEndpoint } from './delete/delete.ts'

export const app = new OpenAPIHono()
app.route('/', get)
app.route('/', deleteEndpoint)
