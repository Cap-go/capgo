import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

async function generateConfig() {
  const files = readdirSync('cloudflare_workers_deno/cloudflare').map(file => file.replace('.ts', ''))

  const envFile = readFileSync('.env')
    .toString('utf8')
    .trim()
    .split('\n')
    .filter((val) => !val.startsWith('#'))
    .map((val) => {
      const split = val.split('=')
      if (split.length < 2)
        throw new Error('invald env file!')

      // save the rest after the first = as the value
      const rest = val.substring(val.indexOf('=') + 1)
      return { name: split[0], value: rest }
    })
    .reduce((acc, cur, _i) => {
      acc[cur.name] = { value: cur.value }
      return acc
    }, {})

  const scripts = files
    .map((file) => {
      return [file, `./cloudflare/${file}.ts`]
    })

  // Generate the functions map

  const imports = scripts.map(([functionName, functionPath]) => {
    return `import ${functionName} from '${functionPath}'`
  }).join('\n')

  const functionsMap = scripts.map(([functionName, functionPath]) => {
    return `  ${functionName}: ${functionName}.fetch,`
  }).join('\n')

  const finalMapFile = `${imports}\n\nexport const map: Record<string, (request: Request, env: any) => Promise<Response>> = {\n${functionsMap}\n}\n`

  const denoFlare = {
    $schema: 'https://raw.githubusercontent.com/skymethod/denoflare/v0.5.12/common/config.schema.json',
    scripts: {
      capgo_functions: {
        path: './main_router.ts',
        localPort: 3030,
        bindings: {
          ...envFile,
          bucket: { bucketName: "capgo" },
        },
        customDomains: [ "api2.capgo.app" ],
      },
    },
    profiles: {
      main: {
        accountId: envFile['CF_ACCOUNT_ID'].value,
        apiToken: envFile['CF_API_TOKEN'].value,
    }
    }
  }

  // console.log()

  const denoflareJson = JSON.stringify(denoFlare, null, 2)
  writeFileSync('cloudflare_workers_deno/.denoflare', denoflareJson)
  writeFileSync('cloudflare_workers_deno/generated_functions_map.ts', finalMapFile)
}

generateConfig()
