import type { R2Bucket, D1Database } from 'https://raw.githubusercontent.com/skymethod/denoflare/v0.5.12/common/cloudflare_workers_types.d.ts';

export interface WorkerEnv {
  readonly capgo_storage: R2Bucket;
  readonly capgo_db: D1Database;
  readonly flags?: string;
  readonly allowIps?: string;
  readonly denyIps?: string;
  readonly directoryListingLimit?: string; // default: 1000 (max) to workaround r2 bug
  readonly allowCorsOrigins?: string; // e.g. * or https://origin1.com, https://origin2.com
  readonly allowCorsTypes?: string; // if allowed cors origin, further restricts by file extension (.mp4, .m3u8, .ts) or content-type (video/mp4, application/x-mpegurl, video/mp2t)
}
