import { honoFactory } from '../../utils/hono.ts'
import deleteHandler from './delete.ts'
import getHandler from './get.ts'
import patchHandler from './patch.ts'
import postHandler from './post.ts'

const app = honoFactory.createApp()

app.route('/', getHandler)
app.route('/', postHandler)
app.route('/', deleteHandler)
app.route('/', patchHandler)

export { app }
