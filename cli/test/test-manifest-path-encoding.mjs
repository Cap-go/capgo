#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { buildPartialUploadPath } from '../src/bundle/partial.ts'

const fileName = 'assets/suite-marketing/images/social-media/sad_post_grey@2x.png'
const fileHash = 'file-hash'
const expectedHash = createHash('sha256').update(fileHash).digest('hex')
const storagePath = buildPartialUploadPath('org-id', 'com.test.app', fileHash, fileName)
const expectedPath = `orgs/org-id/apps/com.test.app/delta/${expectedHash}_assets/suite-marketing/images/social-media/sad_post_grey%402x.png`

if (storagePath !== expectedPath) {
  console.error(`Unexpected storage path: ${storagePath}`)
  process.exit(1)
}

if (storagePath.includes('sad_post_grey@2x.png')) {
  console.error(`Storage path should keep URL-safe object keys: ${storagePath}`)
  process.exit(1)
}

console.log('Manifest storage paths keep URL-safe object keys')
