import type { Event } from '@netlify/functions/dist/function/event'
import Busboy from 'busboy'

export const parseMultipartForm = (event: Event) => {
  return new Promise((resolve) => {
    // we'll store all form fields inside of this
    const fields: any = {}

    // let's instantiate our busboy instance!
    const busboy = new Busboy({
      // it uses request headers
      // to extract the form boundary value (the ----WebKitFormBoundary thing)
      headers: event.headers as any,
    })

    // before parsing anything, we need to set up some handlers.
    // whenever busboy comes across a file ...
    busboy.on(
      'file',
      (fieldname, filestream, filename, transferEncoding, mimeType) => {
        // ... we take a look at the file's data ...
        filestream.on('data', (data) => {
          // ... and write the file's name, type and content into `fields`.
          fields[fieldname] = {
            filename,
            type: mimeType,
            content: data,
          }
        })
      },
    )

    // whenever busboy comes across a normal field ...
    busboy.on('field', (fieldName, value) => {
      // ... we write its value into `fields`.
      fields[fieldName] = value
    })

    // once busboy is finished, we resolve the promise with the resulted fields.
    busboy.on('finish', () => {
      resolve(fields)
    })

    // now that all handlers are set up, we can finally start processing our request!
    busboy.write(event.body)
  })
}
