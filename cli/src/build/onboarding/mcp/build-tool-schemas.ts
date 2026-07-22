import { type } from 'arktype'

export const startCapgoBuildInputSchema = type({
  platform: type("'ios' | 'android'").describe('The platform to build: "ios" or "android".'),
})

export const capgoBuildWaitInputSchema = type({
  job_id: type('string').describe('The job_id returned by start_capgo_build.'),
  'timeout_seconds?': type('1 <= number.integer <= 59').describe('How long to wait this call, in seconds. Default 40, maximum 59 (kept under the MCP tool-call timeout). Pass a larger value to wait longer in one call; the build keeps running regardless.'),
})

export const capgoBuildLogsInputSchema = type({
  job_id: type('string').describe('The job_id returned by start_capgo_build.'),
  'cursor?': type('number.integer >= 0').describe('Where to read from. Pass 0 the first time, then the next_cursor from the previous call to get only new lines.'),
})

export const cancelCapgoBuildInputSchema = type({
  job_id: type('string').describe('The job_id returned by start_capgo_build.'),
})
