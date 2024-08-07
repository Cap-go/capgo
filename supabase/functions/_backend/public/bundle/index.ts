import { OpenAPIHono } from '@hono/zod-openapi'
import { defaultOpenApiErrorHandler } from '../../utils/open_api.ts'
import { getApp } from './get.ts'
import { deleteApp } from './delete.ts'

export const app = new OpenAPIHono()

app.use('*', defaultOpenApiErrorHandler)
app.route('/', getApp)
app.route('/', deleteApp)
