import {
  REPLICA_TABLES,
  readReplicaSchemaCatalog,
  type Queryable,
} from './schema_catalog.ts'

interface SchemaColumn {
  table: string
  name: string
  type: string
  notNull: boolean
  default: string | null
  identity: string
  generated: string
}

interface SchemaConstraint {
  name: string
}

interface SchemaIndex {
  table: string
  name: string
  definition: string
}

interface SchemaTable {
  name: string
}

interface SchemaCatalog {
  columns?: SchemaColumn[]
  constraints?: SchemaConstraint[]
  indexes?: SchemaIndex[]
  tables?: SchemaTable[]
}

interface SyncStatement {
  kind: 'column' | 'index' | 'not_null'
  table: string
  name: string
  sql: string
}

interface SkippedChange {
  kind: 'column' | 'index'
  table: string
  name: string
  reason: string
}

export interface AdditiveSchemaSyncPlan {
  statements: SyncStatement[]
  skipped: SkippedChange[]
}

export interface AdditiveSchemaSyncResult {
  applied: Array<Omit<SyncStatement, 'sql'>>
  skipped: SkippedChange[]
}

const SAFE_IDENTIFIER_RE = /^[A-Za-z_]\w*$/
const SAFE_SQL_FRAGMENT_RE = /^[\w .()[\],:'"{}+\-=<>!]+$/
const REPLICA_TABLE_SET = new Set<string>(REPLICA_TABLES)

export function planReadReplicaAdditiveSchemaSync(expected: unknown, actual: unknown): AdditiveSchemaSyncPlan {
  const expectedCatalog = assertSchemaCatalog(expected)
  const actualCatalog = assertSchemaCatalog(actual)
  const actualTables = new Set((actualCatalog.tables ?? []).map(table => table.name))
  const actualColumns = new Set((actualCatalog.columns ?? []).map(column => columnKey(column)))
  const actualIndexes = new Set((actualCatalog.indexes ?? []).map(index => index.name))
  const expectedConstraintIndexes = new Set((expectedCatalog.constraints ?? []).map(constraint => constraint.name))
  const statements: SyncStatement[] = []
  const skipped: SkippedChange[] = []

  for (const column of expectedCatalog.columns ?? []) {
    if (actualColumns.has(columnKey(column)))
      continue

    const addColumnSql = buildAddColumnStatement(column, actualTables)
    if (!addColumnSql) {
      skipped.push({
        kind: 'column',
        table: column.table,
        name: column.name,
        reason: 'unsupported_additive_column',
      })
      continue
    }

    statements.push({
      kind: 'column',
      table: column.table,
      name: column.name,
      sql: addColumnSql,
    })

    if (column.notNull) {
      statements.push({
        kind: 'not_null',
        table: column.table,
        name: column.name,
        sql: `ALTER TABLE ${quoteQualifiedTable(column.table)} ALTER COLUMN ${quoteIdent(column.name)} SET NOT NULL`,
      })
    }
  }

  for (const index of expectedCatalog.indexes ?? []) {
    if (actualIndexes.has(index.name))
      continue

    if (expectedConstraintIndexes.has(index.name)) {
      skipped.push({
        kind: 'index',
        table: index.table,
        name: index.name,
        reason: 'constraint_owned_index',
      })
      continue
    }

    const addIndexSql = buildCreateIndexStatement(index, actualTables)
    if (!addIndexSql) {
      skipped.push({
        kind: 'index',
        table: index.table,
        name: index.name,
        reason: 'unsupported_additive_index',
      })
      continue
    }

    statements.push({
      kind: 'index',
      table: index.table,
      name: index.name,
      sql: addIndexSql,
    })
  }

  return { statements, skipped }
}

export async function applyReadReplicaAdditiveSchemaSync(client: Queryable, expected: unknown): Promise<AdditiveSchemaSyncResult> {
  const actual = await readReplicaSchemaCatalog(client)
  const plan = planReadReplicaAdditiveSchemaSync(expected, actual)

  for (const statement of plan.statements)
    await client.query(statement.sql)

  return {
    applied: plan.statements.map(({ kind, table, name }) => ({ kind, table, name })),
    skipped: plan.skipped,
  }
}

function assertSchemaCatalog(value: unknown): SchemaCatalog {
  if (!value || typeof value !== 'object')
    throw new Error('Expected read-replica schema catalog JSON object')

  const catalog = value as SchemaCatalog
  if (catalog.columns && !Array.isArray(catalog.columns))
    throw new Error('Read-replica schema catalog columns must be an array')
  if (catalog.constraints && !Array.isArray(catalog.constraints))
    throw new Error('Read-replica schema catalog constraints must be an array')
  if (catalog.indexes && !Array.isArray(catalog.indexes))
    throw new Error('Read-replica schema catalog indexes must be an array')
  if (catalog.tables && !Array.isArray(catalog.tables))
    throw new Error('Read-replica schema catalog tables must be an array')

  return catalog
}

function buildAddColumnStatement(column: SchemaColumn, actualTables: Set<string>): string | null {
  if (!isSafeReplicaTable(column.table, actualTables))
    return null
  if (!isSafeIdentifier(column.name))
    return null
  if (column.identity || column.generated)
    return null
  if (!isSafeSqlFragment(column.type))
    return null
  if (column.default !== null && (!isSafeSqlFragment(column.default) || !isSafeConstantDefault(column.default)))
    return null
  if (column.notNull && (column.default === null || isNullDefault(column.default)))
    return null

  const defaultSql = column.default === null ? '' : ` DEFAULT ${column.default}`
  return `ALTER TABLE ${quoteQualifiedTable(column.table)} ADD COLUMN IF NOT EXISTS ${quoteIdent(column.name)} ${column.type}${defaultSql}`
}

function buildCreateIndexStatement(index: SchemaIndex, actualTables: Set<string>): string | null {
  if (!isSafeReplicaTable(index.table, actualTables))
    return null
  if (!isSafeIdentifier(index.name))
    return null
  if (!isSafeSqlFragment(index.definition))
    return null

  const parsedDefinition = parseCreateIndexDefinition(index.definition)
  if (!parsedDefinition)
    return null

  const { unique, indexName, tableName, indexTail } = parsedDefinition
  if (indexName !== index.name || tableName !== index.table)
    return null

  return `CREATE ${unique}INDEX CONCURRENTLY IF NOT EXISTS ${quoteIdent(index.name)} ON ${quoteQualifiedTable(index.table)} ${indexTail}`
}

function parseCreateIndexDefinition(definition: string): { unique: string, indexName: string, tableName: string, indexTail: string } | null {
  let rest = definition
  if (!rest.startsWith('CREATE '))
    return null
  rest = rest.slice('CREATE '.length)

  const unique = rest.startsWith('UNIQUE ') ? 'UNIQUE ' : ''
  if (unique)
    rest = rest.slice(unique.length)

  if (!rest.startsWith('INDEX '))
    return null
  rest = rest.slice('INDEX '.length)

  const indexNameEnd = rest.indexOf(' ')
  if (indexNameEnd === -1)
    return null
  const indexName = rest.slice(0, indexNameEnd)
  rest = rest.slice(indexNameEnd + 1)

  const tablePrefix = 'ON public.'
  if (!rest.startsWith(tablePrefix))
    return null
  rest = rest.slice(tablePrefix.length)

  const tableNameEnd = rest.indexOf(' ')
  if (tableNameEnd === -1)
    return null

  return {
    unique,
    indexName,
    tableName: rest.slice(0, tableNameEnd),
    indexTail: rest.slice(tableNameEnd + 1),
  }
}

function isSafeReplicaTable(table: string, actualTables: Set<string>): boolean {
  return REPLICA_TABLE_SET.has(table) && actualTables.has(table) && isSafeIdentifier(table)
}

function isSafeIdentifier(value: string): boolean {
  return SAFE_IDENTIFIER_RE.test(value)
}

function isSafeSqlFragment(value: string): boolean {
  return SAFE_SQL_FRAGMENT_RE.test(value)
    && !value.includes(';')
    && !value.includes('--')
    && !value.includes('/*')
    && !value.includes('*/')
}

function isSafeConstantDefault(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '(')
      continue

    const previous = previousNonWhitespace(value, index)
    if (previous && (isIdentifierChar(previous) || previous === '"'))
      return false
  }

  return true
}

function previousNonWhitespace(value: string, index: number): string | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!isWhitespace(value[cursor]))
      return value[cursor]
  }

  return null
}

function isWhitespace(value: string): boolean {
  return value === ' ' || value === '\n' || value === '\r' || value === '\t' || value === '\f'
}

function isIdentifierChar(value: string): boolean {
  return value === '_'
    || (value >= 'A' && value <= 'Z')
    || (value >= 'a' && value <= 'z')
    || (value >= '0' && value <= '9')
}

function isNullDefault(value: string): boolean {
  return /^NULL\b/i.test(value)
}

function quoteQualifiedTable(table: string): string {
  return `public.${quoteIdent(table)}`
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function columnKey(column: Pick<SchemaColumn, 'table' | 'name'>): string {
  return `${column.table}.${column.name}`
}
