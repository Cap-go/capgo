import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

async function generateConfig() {
  const files = readdirSync('cloudflare_workers_deno/cloudflare').map(file => file.replace('.ts', ''))

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

  writeFileSync('cloudflare_workers_deno/generated_functions_map.ts', finalMapFile)
}

generateConfig()
