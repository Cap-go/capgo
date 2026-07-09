import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stableStringify } from '../read_replicate/schema_catalog.ts'

const [expectedPath, actualPath] = process.argv.slice(2)

async function main() {
  if (!expectedPath || !actualPath) {
    console.error('Usage: bun scripts/compare-read-replica-schema-catalog.ts <expected-json> <actual-json>')
    process.exitCode = 1
    return
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'read-replica-schema-'))

  try {
    const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
    const actual = JSON.parse(await readFile(actualPath, 'utf8'))
    const expectedText = `${stableStringify(expected)}\n`
    const actualText = `${stableStringify(actual)}\n`

    if (expectedText === actualText) {
      console.log('Read-replica schema catalog matches the committed snapshot.')
      return
    }

    const normalizedExpectedPath = join(tempDir, 'expected.json')
    const normalizedActualPath = join(tempDir, 'actual.json')
    await writeFile(normalizedExpectedPath, expectedText)
    await writeFile(normalizedActualPath, actualText)

    console.error('::error title=Read-replica schema is out of date::Hyperdrive read replica does not match read_replicate/schema_replicate.catalog.json.')
    console.error('')
    console.error('The production source schema was updated, but the read replica visible through Hyperdrive still differs from the committed replica schema catalog.')
    console.error('Apply the matching read-replica DDL or maintenance flow, then retry the release.')
    console.error('')
    console.error('Diff:')

    const diff = spawnSync('diff', ['-u', normalizedExpectedPath, normalizedActualPath], {
      encoding: 'utf8',
    })
    if (diff.stdout)
      console.error(diff.stdout)
    if (diff.stderr)
      console.error(diff.stderr)

    process.exitCode = 1
  }
  finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

await main()
