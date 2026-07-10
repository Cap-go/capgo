interface SchemaColumn {
  table: string
  name: string
  type: string
  notNull: boolean
  default: string | null
  generated: string
}

interface SchemaIndex {
  table: string
  name: string
  definition: string
  valid: boolean
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

interface SchemaCatalog {
  version?: number
  columns?: SchemaColumn[]
  indexes?: SchemaIndex[]
  tables?: SchemaTable[]
  types?: SchemaType[]
}

export interface SchemaCompatibilityIssue {
  kind: 'catalog_version' | 'column' | 'index' | 'table' | 'type'
  object: string
  reason: string
}

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
  compareTypes(expectedCatalog, actualCatalog, issues)
  compareIndexes(expectedCatalog, actualCatalog, issues)

  return issues
}

function compareTables(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
  const actualTables = new Map((actual.tables ?? []).map(table => [table.name, table]))
  for (const expectedTable of expected.tables ?? []) {
    const actualTable = actualTables.get(expectedTable.name)
    if (!actualTable) {
      issues.push({ kind: 'table', object: expectedTable.name, reason: 'missing required table' })
      continue
    }
    if (actualTable.kind !== expectedTable.kind)
      issues.push({ kind: 'table', object: expectedTable.name, reason: `expected kind ${expectedTable.kind}, found ${actualTable.kind}` })
    if (stableJson(actualTable.reloptions) !== stableJson(expectedTable.reloptions))
      issues.push({ kind: 'table', object: expectedTable.name, reason: 'table options differ' })
  }
}

function compareColumns(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
  const expectedColumns = new Set((expected.columns ?? []).map(column => columnKey(column)))
  const actualColumns = new Map((actual.columns ?? []).map(column => [columnKey(column), column]))

  for (const expectedColumn of expected.columns ?? []) {
    const key = columnKey(expectedColumn)
    const actualColumn = actualColumns.get(key)
    if (!actualColumn) {
      issues.push({ kind: 'column', object: key, reason: 'missing required column' })
      continue
    }
    if (actualColumn.type !== expectedColumn.type) {
      issues.push({
        kind: 'column',
        object: key,
        reason: `expected type ${expectedColumn.type}, found ${actualColumn.type}`,
      })
    }
    if (!expectedColumn.notNull && actualColumn.notNull) {
      issues.push({
        kind: 'column',
        object: key,
        reason: 'subscriber is NOT NULL while publisher accepts NULL',
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
    if (!expectedColumns.has(key) && actualColumn.notNull && actualColumn.default === null && !actualColumn.generated) {
      issues.push({
        kind: 'column',
        object: key,
        reason: 'subscriber-only NOT NULL column has no default',
      })
    }
  }
}

function compareTypes(expected: SchemaCatalog, actual: SchemaCatalog, issues: SchemaCompatibilityIssue[]): void {
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

    const compatible = expectedType.kind === 'e'
      ? enumContainsExpectedValues(expectedType.definition, actualType.definition)
      : stableJson(expectedType.definition) === stableJson(actualType.definition)
    if (!compatible) {
      issues.push({
        kind: 'type',
        object: expectedType.name,
        reason: expectedType.kind === 'e' ? 'subscriber enum is missing publisher values' : 'type definition differs',
      })
    }
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
    if (!actualIndex.valid)
      issues.push({ kind: 'index', object: expectedIndex.name, reason: 'index is invalid' })
    if (actualIndex.definition !== expectedIndex.definition)
      issues.push({ kind: 'index', object: expectedIndex.name, reason: 'index definition differs' })
  }

  for (const actualIndex of actual.indexes ?? []) {
    if (!expectedIndexes.has(actualIndex.name))
      issues.push({ kind: 'index', object: actualIndex.name, reason: 'unexpected index adds storage and write cost' })
  }
}

function assertSchemaCatalog(value: unknown, label: string): SchemaCatalog {
  if (!value || typeof value !== 'object')
    throw new Error(`Expected ${label} read-replica schema catalog JSON object`)

  const catalog = value as SchemaCatalog
  for (const collection of ['columns', 'indexes', 'tables', 'types'] as const) {
    if (catalog[collection] !== undefined && !Array.isArray(catalog[collection]))
      throw new Error(`Read-replica schema catalog ${collection} must be an array`)
  }
  return catalog
}

function enumContainsExpectedValues(expected: unknown, actual: unknown): boolean {
  if (!Array.isArray(expected) || !Array.isArray(actual))
    return stableJson(expected) === stableJson(actual)

  const actualValues = new Set(actual.map(value => stableJson(value)))
  return expected.every(value => actualValues.has(stableJson(value)))
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

function columnKey(column: Pick<SchemaColumn, 'table' | 'name'>): string {
  return `${column.table}.${column.name}`
}

function displayValue(value: string): string {
  return value || 'none'
}
