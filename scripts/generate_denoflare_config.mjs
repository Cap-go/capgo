import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const baseDenoFlare = JSON.stringify({
  $schema: 'https://raw.githubusercontent.com/skymethod/denoflare/v0.5.12/common/config.schema.json',
  scripts: {

  },
}, null, 4)

async function generateConfig() {
  const files = readdirSync('cloudflare_workers_deno/cloudflare').map(file => file.replace('.ts', ''))

  const envFile = readFileSync('.env')
    .toString('utf8')
    .trim()
    .split('\n')
    .map((val) => {
      const split = val.split('=')
      if (split.length !== 2)
        throw new Error('invald env file!')

      return { name: split[0], value: split[1] }
    })
    .reduce((acc, cur, _i) => {
      acc[cur.name] = { value: cur.value }
      return acc
    }, {})

  const scripts = files
    .map((file) => {
      const object = {
        path: `./cloudflare/${file}.ts`,
        localPort: 3030,
        bindings: envFile,
      }

      return [file, object]
    })

  // .reduce((acc, cur, _i) => {
  //   acc = Object.assign(acc, cur)
  //   return acc
  // }, {})

  const denoFlare = {
    $schema: 'https://raw.githubusercontent.com/skymethod/denoflare/v0.5.12/common/config.schema.json',
    scripts: Object.fromEntries(new Map(scripts)),
  }

  // console.log()

  const denoflareJson = JSON.stringify(denoFlare, null, 2)
  writeFileSync('cloudflare_workers_deno/.denoflare', denoflareJson)
}

generateConfig()
