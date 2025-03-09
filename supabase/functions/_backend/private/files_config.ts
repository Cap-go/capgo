import { getRuntimeKey } from 'hono/adapter'
import { ALERT_UPLOAD_SIZE_BYTES, MAX_CHUNK_SIZE_BYTES, MAX_UPLOAD_LENGTH_BYTES } from '../tus/uploadHandler.ts'
import { honoFactory, useCors } from '../utils/hono.ts'

export const app = honoFactory.createApp()

app.use('/', useCors)

app.get('/', (c) => {
  if (getRuntimeKey() !== 'workerd') {
    // Partial and TUS upload are only available on workerd
    return c.json({
      partialUpload: false,
      partialUploadForced: false,
      maxUploadLength: MAX_UPLOAD_LENGTH_BYTES,
      maxChunkSize: MAX_CHUNK_SIZE_BYTES,
      alertUploadSize: ALERT_UPLOAD_SIZE_BYTES,
      TUSUpload: false,
      TUSUploadForced: false,
    })
  }
  // force partial and tus for 20% of the requests
  // const randomPU = Math.random()
  const randomTUS = Math.random()
  const forcePartialUpload = randomTUS < 0.5
  // const forceTUSUpload = randomTUS < 0.3
  return c.json({
    partialUpload: true,
    partialUploadForced: forcePartialUpload,
    maxUploadLength: MAX_UPLOAD_LENGTH_BYTES,
    maxChunkSize: MAX_CHUNK_SIZE_BYTES,
    alertUploadSize: ALERT_UPLOAD_SIZE_BYTES,
    TUSUpload: true,
    TUSUploadForced: true, // TODO: remove this when fix the issue with normal upload
  })
})
