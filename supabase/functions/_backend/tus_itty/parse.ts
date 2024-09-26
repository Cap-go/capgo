// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { StatusError } from 'itty-router'
import { X_SIGNAL_CHECKSUM_SHA256 } from './uploadHandler.ts'
import { fromBase64 } from './util.ts'

export interface UploadMetadata {
  filename?: string
}

// Parse "Upload-Metadata" header as described in the TUS creation extension
// https://tus.io/protocols/resumable-upload#upload-metadata
export function parseUploadMetadata(headers: Headers): UploadMetadata {
  const uploadMetadata: string | null = headers.get('Upload-Metadata')
  if (uploadMetadata == null) {
    return {}
  }
  const ret: UploadMetadata = {}
  const pairs = uploadMetadata.split(',')
  for (const pair of pairs) {
    const [key, value] = pair.split(' ', 2)
    if (key == null || key === '') {
      console.log('upload-metadata entries must have keys')
      throw new StatusError(400, 'upload-metadata entries must have keys')
    }

    if (value == null) {
      // skip: leaving the value off is in spec, but none of the keys we care about allow it
      continue
    }

    const valueBytes: Uint8Array | undefined = fromBase64(value)
    if (valueBytes == null) {
      console.log('upload metadata must be base64 encoded')
      throw new StatusError(400, 'upload metadata must be base64 encoded')
    }

    if (key === 'filename') {
      ret.filename = new TextDecoder().decode(valueBytes)
    }
  }
  return ret
}

export function parseChecksum(headers: Headers): Uint8Array | undefined {
  const checksum = headers.get(X_SIGNAL_CHECKSUM_SHA256)
  if (checksum == null) {
    return
  }

  const bytes = fromBase64(checksum)
  if (bytes == null) {
    console.log('checksum should be base64')
    throw new StatusError(400, 'checksum should be base64')
  }

  if (bytes.length !== 32) {
    console.log('SHA-256 checksum should be 32 bytes')
    throw new StatusError(400, 'SHA-256 checksum should be 32 bytes')
  }
  return bytes
}
