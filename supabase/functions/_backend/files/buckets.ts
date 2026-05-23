export interface AttachmentBucketBindings {
  ATTACHMENT_BUCKET?: R2Bucket
  ATTACHMENT_UPLOAD_BUCKET?: R2Bucket
  ATTACHMENT_DOWNLOAD_BUCKET?: R2Bucket
  ATTACHMENT_FALLBACK_BUCKET?: R2Bucket
}

function uniqueBuckets(buckets: Array<R2Bucket | undefined>): R2Bucket[] {
  return [...new Set(buckets.filter((bucket): bucket is R2Bucket => bucket != null))]
}

export function getAttachmentUploadBucket(env: AttachmentBucketBindings): R2Bucket | undefined {
  return env.ATTACHMENT_UPLOAD_BUCKET ?? env.ATTACHMENT_BUCKET
}

export function getAttachmentDownloadBuckets(env: AttachmentBucketBindings): R2Bucket[] {
  return uniqueBuckets([
    env.ATTACHMENT_DOWNLOAD_BUCKET ?? env.ATTACHMENT_BUCKET,
    env.ATTACHMENT_UPLOAD_BUCKET,
    env.ATTACHMENT_FALLBACK_BUCKET,
    env.ATTACHMENT_BUCKET,
  ])
}
