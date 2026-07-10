import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { readReplicaSchemaCompatibilityIssues } from '../read_replicate/schema_compatibility.ts'

const [expectedPath, actualPath] = process.argv.slice(2)

async function main() {
  if (!expectedPath || !actualPath) {
    console.error('Usage: bun scripts/compare-read-replica-schema-catalog.ts <expected-json> <actual-json>')
    process.exitCode = 1
    return
  }

  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  const actual = JSON.parse(await readFile(actualPath, 'utf8'))
  const issues = readReplicaSchemaCompatibilityIssues(expected, actual)

  if (!issues.length) {
    console.log('Read-replica schema is compatible with the committed snapshot.')
    return
  }

  console.error('::error title=Read-replica schema is incompatible::Hyperdrive read replica is not compatible with read_replicate/schema_replicate.catalog.json after additive sync.')
  console.error('')
  console.error('The check ignores column order, defaults, constraints, sequences, and functions because they do not prevent logical replication.')
  console.error('Indexes still require exact parity because unexpected indexes add storage and write-maintenance cost.')
  console.error('')
  console.error('Incompatible objects:')
  for (const issue of issues)
    console.error(`- ${issue.kind} ${issue.object}: ${issue.reason}`)
  process.exitCode = 1
}

await main()
