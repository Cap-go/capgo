import tableDefinitionsData from '../schema.json' assert { type: "json" };

export type SQLiteType = 'INTEGER' | 'TEXT' | 'BOOLEAN' | 'JSON';

// Define the structure expected from the JSON file
export interface TableDefinitionJson {
  primaryKey: string;
  columns: Record<string, SQLiteType>;
  indexes?: (string | string[])[]; // Array of single columns (string) or composite columns (string[])
}

// Type assertion for the imported data - using 'as' acknowledges potential type looseness from JSON import
const TABLE_DEFINITIONS_JSON = tableDefinitionsData as Record<string, TableDefinitionJson>;

// --- Derived types and constants based on the imported JSON --- 

// Derived type for compatibility with existing code
export interface TableSchema {
  name: string;
  columns: string[];
  primaryKey: string;
}

// Generate TABLES array from JSON definitions
export const TABLES: TableSchema[] = Object.entries(TABLE_DEFINITIONS_JSON).map(([name, def]) => ({
  name,
  columns: Object.keys(def.columns),
  primaryKey: def.primaryKey
}));

// Generate TABLE_SCHEMAS_TYPES from JSON definitions
export const TABLE_SCHEMAS_TYPES: Record<string, Record<string, SQLiteType>> = 
  Object.fromEntries(
    Object.entries(TABLE_DEFINITIONS_JSON).map(([name, def]) => [name, def.columns])
  );

// Function to generate CREATE TABLE SQL for a table definition from JSON
function generateCreateTableSQL(tableName: string, tableDef: TableDefinitionJson): string {
  const columns = Object.entries(tableDef.columns)
    .map(([colName, colType]) => {
      let sqlType: string;
      switch (colType) {
        case 'INTEGER':
          sqlType = 'INTEGER';
          break;
        case 'BOOLEAN':
          sqlType = 'BOOLEAN'; // D1 supports BOOLEAN
          break;
        case 'JSON':
          sqlType = 'TEXT'; // SQLite stores JSON as TEXT
          break;
        case 'TEXT':
        default:
          sqlType = 'TEXT';
          break;
      }
      
      const isPrimary = colName === tableDef.primaryKey ? ' PRIMARY KEY' : '';
      return `    ${colName} ${sqlType}${isPrimary}`;
    })
    .join(',\n');

  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n${columns}\n);`;
}

// Function to generate indexes for a table definition from JSON
function generateIndexesSQL(tableName: string, tableDef: TableDefinitionJson): string[] {
  const indexes: string[] = [];
  
  // Always add primary key index
  indexes.push(`CREATE INDEX IF NOT EXISTS idx_${tableName}_${tableDef.primaryKey} ON ${tableName}(${tableDef.primaryKey});`);
  
  // Process indexes defined in JSON
  if (tableDef.indexes) {
    for (const indexDefinition of tableDef.indexes) {
      if (typeof indexDefinition === 'string') {
        // Single column index
        const colName = indexDefinition;
        // Ensure the column exists and is not the primary key (already indexed)
        if (colName in tableDef.columns && colName !== tableDef.primaryKey) {
          indexes.push(`CREATE INDEX IF NOT EXISTS idx_${tableName}_${colName} ON ${tableName}(${colName});`);
        }
      } else if (Array.isArray(indexDefinition)) {
        // Composite index
        const validColumns = indexDefinition.filter(col => col in tableDef.columns);
        if (validColumns.length > 0) {
            const indexName = `idx_${tableName}_${validColumns.join('_')}`;
            const columnList = validColumns.join(', ');
            indexes.push(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columnList});`);
        }
      }
    }
  }
  
  return indexes;
}

// Generate SQL schema statements dynamically from the JSON
const generatedSchemas: Record<string, string> = {};
for (const [tableName, tableDef] of Object.entries(TABLE_DEFINITIONS_JSON)) {
  const createTableSql = generateCreateTableSQL(tableName, tableDef);
  const indexSql = generateIndexesSQL(tableName, tableDef).join('\n');
  generatedSchemas[tableName] = `${createTableSql}\n\n${indexSql}`;
}

// Group all schemas for easy access
export const TABLE_SCHEMAS: Record<string, string> = generatedSchemas;
  