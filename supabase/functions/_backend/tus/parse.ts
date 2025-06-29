// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Context } from '@hono/hono'
import { HTTPException } from 'hono/http-exception'
import { cloudlog } from '../utils/loggin.ts'
import { X_CHECKSUM_SHA256 } from './uploadHandler.ts'
import { fromBase64 } from './util.ts'

export interface UploadMetadata {
  filename?: string
}

// Parse "Upload-Metadata" header as described in the TUS creation extension
// https://tus.io/protocols/resumable-upload#upload-metadata
export function parseUploadMetadata(c: Context, headers: Headers): UploadMetadata {
  const uploadMetadata: string | null = headers.get('Upload-Metadata')
  cloudlog({ requestId: c.get('requestId'), message: 'parseUploadMetadata', uploadMetadata })
  if (uploadMetadata == null) {
    return {}
  }
  const ret: UploadMetadata = {}
  const pairs = uploadMetadata.split(',')
  for (const pair of pairs) {
    const [key, value] = pair.split(' ', 2)
    if (key == null || key === '') {
      throw new HTTPException(400, { message: 'upload-metadata entries must have keys' })
    }

    if (value == null) {
      // skip: leaving the value off is in spec, but none of the keys we care about allow it
      continue
    }

    const valueBytes: Uint8Array | undefined = fromBase64(value)
    if (valueBytes == null) {
      throw new HTTPException(400, { message: 'upload metadata must be base64 encoded' })
    }

    if (key === 'filename') {
      ret.filename = new TextDecoder().decode(valueBytes)
    }
  }
  return ret
}

export function parseChecksum(headers: Headers): Uint8Array | undefined {
  const checksum = headers.get(X_CHECKSUM_SHA256)
  if (checksum == null) {
    return
  }

  const bytes = fromBase64(checksum)
  if (bytes == null) {
    throw new HTTPException(400, { message: 'checksum should be base64' })
  }

  if (bytes.length !== 32) {
    throw new HTTPException(400, { message: 'SHA-256 checksum should be 32 bytes' })
  }
  return bytes
}
