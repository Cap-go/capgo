interface SchemaColumn {
  table: string
  name: string
  position: number
  type: string
  notNull: boolean
  default: string | null
  identity: string
  generated: string
}

interface SchemaConstraint {
  table: string
  name: string
  type: string
  definition: string
  valid?: boolean
}

interface SchemaIndex {
  table: string
  name: string
  definition: string
  valid: boolean
  constraintOwned?: boolean
}

interface SchemaTable {
  name: string
  kind: string
  reloptions: unknown
}

interface SchemaType {
  name: string
  kind: string
  definition: unknown
}

interface SchemaSequence {
  name: string
  type: string
  start: string
  increment: string
  min: string
  max: string
  cache: string
  cycle: boolean
  ownedTable: string | null
  ownedColumn: string | null
}

interface SchemaFunction {
  name: string
  arguments: string
  definition: string
}

interface SchemaCatalog {
  version?: number
  columns?: SchemaColumn[]
  constraints?: SchemaConstraint[]
  indexes?: SchemaIndex[]
  tables?: SchemaTable[]
  types?: SchemaType[]
  sequences?: SchemaSequence[]
  functions?: SchemaFunction[]
}

export interface SchemaCompatibilityIssue {
  kind: 'catalog_version' | 'column' | 'constraint' | 'function' | 'index' | 'sequence' | 'table' | 'type'
  object: string
  reason: string
}

// The catalog intentionally excludes foreign keys, triggers, and RLS. Those
// objects remain outside the selected read-replica schema contract.
export function readReplicaSchemaCompatibilityIssues(expected: unknown, actual: unknown): SchemaCompatibilityIssue[] {
  const expectedCatalog = assertSchemaCatalog(expected, 'expected')
  const actualCatalog = assertSchemaCatalog(actual, 'actual')
  const issues: SchemaCompatibilityIssue[] = []

  if (expectedCatalog.version !== actualCatalog.version) {
    issues.push({
      kind: 'catalog_version',
      object: 'catalog',
      reason: `expected version ${expectedCatalog.version ?? 'missing'}, found ${actualCatalog.version ?? 'missing'}`,
    })
  }

  compareTables(expectedCatalog, actualCatalog, issues)
  compareColumns(expectedCatalog, actualCatalog, issues)
  compareConstraints(expectedCatalog, actualCatalog, issues)
  compareIndexes(expectedCatalog, actualCatalog, issues)
  compareTypes(expectedCatalog, actualCatalog, issues)
  compareSequences(expectedCatalog, actualCatalog, issues)
  compareFunctions(expectedCatalog, actualCatalog, issues)

  return issues
}

function compareTables(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
  const expectedTables = new Map((expected.tables ?? []).map(table => [table.name, table]))
  const actualTables = new Map((actual.tables ?? []).map(table => [table.name, table]))

  for (const expectedTable of expected.tables ?? []) {
    const actualTable = actualTables.get(expectedTable.name)
    if (!actualTable) {
      issues.push({ kind: 'table', object: expectedTable.name, reason: 'missing required table' })
      continue
    }
    if (actualTable.kind !== expectedTable.kind)
      issues.push({ kind: 'table', object: expectedTable.name, reason: `expected kind ${expectedTable.kind}, found ${actualTable.kind}` })
    if (!sameValue(actualTable.reloptions, expectedTable.reloptions))
      issues.push({ kind: 'table', object: expectedTable.name, reason: 'table options differ' })
  }

  for (const actualTable of actual.tables ?? []) {
    if (!expectedTables.has(actualTable.name))
      issues.push({ kind: 'table', object: actualTable.name, reason: 'unexpected table' })
  }
}

function compareColumns(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
  const expectedColumns = new Map((expected.columns ?? []).map(column => [columnKey(column), column]))
  const actualColumns = new Map((actual.columns ?? []).map(column => [columnKey(column), column]))

  for (const expectedColumn of expected.columns ?? []) {
    const key = columnKey(expectedColumn)
    const actualColumn = actualColumns.get(key)
    if (!actualColumn) {
      issues.push({ kind: 'column', object: key, reason: 'missing required column' })
      continue
    }

    if (actualColumn.position !== expectedColumn.position) {
      issues.push({
        kind: 'column',
        object: key,
        reason: `expected position ${expectedColumn.position}, found ${actualColumn.position}`,
      })
    }
    if (actualColumn.type !== expectedColumn.type) {
      issues.push({
        kind: 'column',
        object: key,
        reason: `expected type ${expectedColumn.type}, found ${actualColumn.type}`,
      })
    }
    if (actualColumn.notNull !== expectedColumn.notNull) {
      issues.push({
        kind: 'column',
        object: key,
        reason: expectedColumn.notNull
          ? 'publisher is NOT NULL while subscriber accepts NULL'
          : 'subscriber is NOT NULL while publisher accepts NULL',
      })
    }
    if (!sameValue(actualColumn.default, expectedColumn.default)) {
      issues.push({
        kind: 'column',
        object: key,
        reason: `expected default ${displayValue(expectedColumn.default)}, found ${displayValue(actualColumn.default)}`,
      })
    }
    if (actualColumn.identity !== expectedColumn.identity) {
      issues.push({
        kind: 'column',
        object: key,
        reason: `expected identity kind ${displayValue(expectedColumn.identity)}, found ${displayValue(actualColumn.identity)}`,
      })
    }
    if (actualColumn.generated !== expectedColumn.generated) {
      issues.push({
        kind: 'column',
        object: key,
        reason: `expected generated kind ${displayValue(expectedColumn.generated)}, found ${displayValue(actualColumn.generated)}`,
      })
    }
  }

  for (const actualColumn of actual.columns ?? []) {
    const key = columnKey(actualColumn)
    if (!expectedColumns.has(key))
      issues.push({ kind: 'column', object: key, reason: 'unexpected column' })
  }
}

function compareConstraints(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
  const expectedConstraints = new Map((expected.constraints ?? []).map(constraint => [constraintKey(constraint), constraint]))
  const actualConstraints = new Map((actual.constraints ?? []).map(constraint => [constraintKey(constraint), constraint]))

  for (const expectedConstraint of expected.constraints ?? []) {
    const key = constraintKey(expectedConstraint)
    const actualConstraint = actualConstraints.get(key)
    if (!actualConstraint) {
      issues.push({ kind: 'constraint', object: key, reason: 'missing required constraint' })
      continue
    }

    if (actualConstraint.type !== expectedConstraint.type) {
      issues.push({
        kind: 'constraint',
        object: key,
        reason: `expected type ${expectedConstraint.type}, found ${actualConstraint.type}`,
      })
    }
    if (actualConstraint.definition !== expectedConstraint.definition)
      issues.push({ kind: 'constraint', object: key, reason: 'constraint definition differs' })
    if (expectedConstraint.valid !== undefined || actualConstraint.valid !== undefined) {
      if (actualConstraint.valid !== expectedConstraint.valid) {
        issues.push({
          kind: 'constraint',
          object: key,
          reason: `expected valid ${displayValue(expectedConstraint.valid)}, found ${displayValue(actualConstraint.valid)}`,
        })
      }
    }
  }

  for (const actualConstraint of actual.constraints ?? []) {
    const key = constraintKey(actualConstraint)
    if (!expectedConstraints.has(key))
      issues.push({ kind: 'constraint', object: key, reason: 'unexpected constraint' })
  }
}

function compareIndexes(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
  const expectedIndexes = new Map((expected.indexes ?? []).map(index => [index.name, index]))
  const actualIndexes = new Map((actual.indexes ?? []).map(index => [index.name, index]))

  for (const expectedIndex of expected.indexes ?? []) {
    const actualIndex = actualIndexes.get(expectedIndex.name)
    if (!actualIndex) {
      issues.push({ kind: 'index', object: expectedIndex.name, reason: 'missing required index' })
      continue
    }
    if (actualIndex.table !== expectedIndex.table) {
      issues.push({
        kind: 'index',
        object: expectedIndex.name,
        reason: `expected table ${expectedIndex.table}, found ${actualIndex.table}`,
      })
    }
    if (actualIndex.definition !== expectedIndex.definition)
      issues.push({ kind: 'index', object: expectedIndex.name, reason: 'index definition differs' })
    if (actualIndex.valid !== expectedIndex.valid) {
      issues.push({
        kind: 'index',
        object: expectedIndex.name,
        reason: expectedIndex.valid && !actualIndex.valid
          ? 'index is invalid'
          : `expected valid ${displayValue(expectedIndex.valid)}, found ${displayValue(actualIndex.valid)}`,
      })
    }
    if (actualIndex.constraintOwned !== expectedIndex.constraintOwned) {
      issues.push({
        kind: 'index',
        object: expectedIndex.name,
        reason: `expected constraintOwned ${displayValue(expectedIndex.constraintOwned)}, found ${displayValue(actualIndex.constraintOwned)}`,
      })
    }
  }

  for (const actualIndex of actual.indexes ?? []) {
    if (!expectedIndexes.has(actualIndex.name))
      issues.push({ kind: 'index', object: actualIndex.name, reason: 'unexpected index adds storage and write cost' })
  }
}

function compareTypes(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
  const expectedTypes = new Map((expected.types ?? []).map(type => [type.name, type]))
  const actualTypes = new Map((actual.types ?? []).map(type => [type.name, type]))

  for (const expectedType of expected.types ?? []) {
    const actualType = actualTypes.get(expectedType.name)
    if (!actualType) {
      issues.push({ kind: 'type', object: expectedType.name, reason: 'missing required type' })
      continue
    }
    if (actualType.kind !== expectedType.kind) {
      issues.push({
        kind: 'type',
        object: expectedType.name,
        reason: `expected kind ${expectedType.kind}, found ${actualType.kind}`,
      })
      continue
    }
    if (!sameValue(actualType.definition, expectedType.definition))
      issues.push({ kind: 'type', object: expectedType.name, reason: 'type definition differs' })
  }

  for (const actualType of actual.types ?? []) {
    if (!expectedTypes.has(actualType.name))
      issues.push({ kind: 'type', object: actualType.name, reason: 'unexpected type' })
  }
}

function compareSequences(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
  const expectedSequences = new Map((expected.sequences ?? []).map(sequence => [sequence.name, sequence]))
  const actualSequences = new Map((actual.sequences ?? []).map(sequence => [sequence.name, sequence]))
  const fields = [
    ['type', 'type'],
    ['start', 'start'],
    ['increment', 'increment'],
    ['min', 'min'],
    ['max', 'max'],
    ['cache', 'cache'],
    ['cycle', 'cycle'],
    ['ownedTable', 'owned table'],
    ['ownedColumn', 'owned column'],
  ] as const

  for (const expectedSequence of expected.sequences ?? []) {
    const actualSequence = actualSequences.get(expectedSequence.name)
    if (!actualSequence) {
      issues.push({ kind: 'sequence', object: expectedSequence.name, reason: 'missing required sequence' })
      continue
    }

    for (const [field, label] of fields) {
      if (actualSequence[field] !== expectedSequence[field]) {
        issues.push({
          kind: 'sequence',
          object: expectedSequence.name,
          reason: `expected ${label} ${displayValue(expectedSequence[field])}, found ${displayValue(actualSequence[field])}`,
        })
      }
    }
  }

  for (const actualSequence of actual.sequences ?? []) {
    if (!expectedSequences.has(actualSequence.name))
      issues.push({ kind: 'sequence', object: actualSequence.name, reason: 'unexpected sequence' })
  }
}

function compareFunctions(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
  const expectedFunctions = new Map((expected.functions ?? []).map(fn => [functionKey(fn), fn]))
  const actualFunctions = new Map((actual.functions ?? []).map(fn => [functionKey(fn), fn]))

  for (const expectedFunction of expected.functions ?? []) {
    const key = functionKey(expectedFunction)
    const actualFunction = actualFunctions.get(key)
    if (!actualFunction) {
      issues.push({ kind: 'function', object: key, reason: 'missing required function overload' })
      continue
    }
    if (actualFunction.definition !== expectedFunction.definition)
      issues.push({ kind: 'function', object: key, reason: 'function definition differs' })
  }

  for (const actualFunction of actual.functions ?? []) {
    const key = functionKey(actualFunction)
    if (!expectedFunctions.has(key))
      issues.push({ kind: 'function', object: key, reason: 'unexpected function overload' })
  }
}

function assertSchemaCatalog(value: unknown, label: string): SchemaCatalog {
  if (!value || typeof value !== 'object')
    throw new Error(`Expected ${label} read-replica schema catalog JSON object`)

  const catalog = value as SchemaCatalog
  for (const collection of ['columns', 'constraints', 'functions', 'indexes', 'sequences', 'tables', 'types'] as const) {
    if (catalog[collection] !== undefined && !Array.isArray(catalog[collection]))
      throw new Error(`Read-replica schema catalog ${collection} must be an array`)
  }
  return catalog
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right)
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value)) ?? 'undefined'
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sortJson)

  if (!value || typeof value !== 'object')
    return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  )
}

function columnKey(column: Pick<SchemaColumn, 'table' | 'name'>): string {
  return `${column.table}.${column.name}`
}

function constraintKey(constraint: Pick<SchemaConstraint, 'table' | 'name'>): string {
  return `${constraint.table}.${constraint.name}`
}

function functionKey(fn: Pick<SchemaFunction, 'name' | 'arguments'>): string {
  return `${fn.name}(${fn.arguments})`
}

function displayValue(value: unknown): string {
  if (value === undefined)
    return 'missing'
  if (value === null)
    return 'null'
  if (value === '')
    return 'none'
  if (typeof value === 'string')
    return value
  return stableJson(value)
}
