import { OpenAPIHono, z } from '@hono/zod-openapi'
import { plainError } from '../../utils/open_api.ts'
import { app as get } from './get.ts'
import { app as deleteEndpoint } from './delete.ts'

export const app = new OpenAPIHono()
app.route('/', get)
app.route('/', deleteEndpoint)
