/// <reference types="@cloudflare/workers-types" />

import { 
  TABLE_SCHEMAS_TYPES,
  TABLES,
  TABLE_SCHEMAS,
} from "./schema.ts";
import type { TableSchema, SQLiteType } from "./schema.ts";
// import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Removed Supabase client
// import { Pool, type PoolClient } from 'pg'; // Removed pg Pool
import postgres from 'postgres'; // Use default import

// Define constants
const BATCH_SIZE = 998; // D1 batch size for statements

interface Env {
  DB: D1Database;
  HYPERDRIVE_DB: Hyperdrive; // Add Hyperdrive binding
  WEBHOOK_SECRET: string;
}

interface NukeRequest {
  type: 'all' | 'table';
  table?: string;
}

// Helper function for JSON stringify to handle BigInt
function jsonReplacer(key: string, value: any): any {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return value;
}

// Function to convert values based on their type
function convertValue(value: any, type: SQLiteType): any {
  if (value === null || value === undefined)
    return null;

  // Always convert BigInt to Number or String if too large
  // D1 driver might handle Numbers, but stringify and others might not.
  // Convert to Number for smaller BigInts, string for larger ones.
  if (typeof value === 'bigint') {
    // Check if BigInt is within safe Number range
    if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
      console.warn(`[convertValue] BigInt too large for safe Number conversion, converting to string: ${value.toString()}`);
      return value.toString();
    }
    return Number(value);
  }

  switch (type) {
    case 'INTEGER':
      // Convert timestamp to unix timestamp if it's a date string
      if (typeof value === 'string' && value.includes('T')) {
        return Math.floor(new Date(value).getTime() / 1000);
      }
      return typeof value === 'string' ? Number.parseInt(value) : value;
    case 'BOOLEAN':
      return value ? 1 : 0;
    case 'JSON':
      if (typeof value === 'string') {
        // If it's already a JSON string, return it as is
        try {
          JSON.parse(value); // Validate it's valid JSON
          return value;
        } catch (e) {
          // Not valid JSON, stringify it
          return JSON.stringify(value, jsonReplacer);
        }
      }
      
      if (Array.isArray(value) && value.length > 0 && 's3_path' in value[0]) {
        // Store as [prefix, [file_name, file_hash], [file_name, file_hash], ...]
        const prefix = value[0].s3_path.slice(0, -value[0].file_name.length);
        return JSON.stringify([
          prefix,
          ...value.map((v: any) => [v.file_name, v.file_hash]),
        ]);
      }
      
      try {
        return JSON.stringify(value, jsonReplacer);
      } catch (e) {
        // Use the replacer for safe logging here too
        console.error("Error stringifying JSON:", e, "Value:", JSON.stringify(value, jsonReplacer));
        return null;
      }
    default:
      return value;
  }
}

// Helper function to determine if a value is a valid UUID string
function isUUIDValue(value: any): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  // Regular expression for standard UUID format
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/i;
  return uuidRegex.test(value);
}

// Clean fields that are not in the D1 table
function cleanFields(record: any, tableName: string): Record<string, any> {
  if (!record)
    return record;

  const schema = TABLE_SCHEMAS_TYPES[tableName as keyof typeof TABLE_SCHEMAS_TYPES];
  if (!schema) {
    console.error(`[cleanFields ${tableName}] Unknown table schema`);
    return record;
  }

  // Only keep columns that exist in schema
  const cleanRecord: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    // Skip if column not in schema
    if (!(key in schema)) {
      continue;
    }

    const type = schema[key];
    const convertedValue = convertValue(value, type);
    if (convertedValue !== null && convertedValue !== undefined) {
      // Make UUIDs lowercase if the value is a valid UUID string
      if (isUUIDValue(convertedValue)) {
        cleanRecord[key] = (convertedValue as string).toLowerCase();
      } else {
        cleanRecord[key] = convertedValue;
      }
    }
  }

  return cleanRecord;
}

// Update handleMessage function to use the new schema structure
// Adapts to the message format from trigger_http_queue_post_to_function_d1
function handleMessage(pgmqMsg: any, table: TableSchema) {
  // Assume pgmqMsg format: { msg_id: number, ..., message: { record: object | null, old_record: object | null, type: string, table: string } }
  const { msg_id, message } = pgmqMsg;
  // Extract operation type and determine the relevant data record based on the operation type
  const opType = message?.type?.toUpperCase(); 
  const tableName = table.name;
  const columns = table.columns.filter(col => col !== table.primaryKey);
  
  let value: any = null;
  if (opType === 'INSERT' || opType === 'UPDATE') {
    value = message.record;
  } else if (opType === 'DELETE') {
    value = message.old_record; // Use old_record for DELETE to get the PK
  }

  console.log(`[Handle PGMQ ${tableName}] Processing msg_id: ${msg_id}, op: ${opType}`);

  try {
    // Validate input based on pgmq message format
    if (!value || typeof value !== 'object') {
      console.error(`[PGMQ ${tableName}] Invalid or missing message data (record/old_record) in msg_id ${msg_id}:`, message);
      throw new Error(`Invalid or missing message data for table ${tableName}, msg_id ${msg_id}, operation ${opType}`);
    }

    // Clean and convert the values
    const cleanedValue = cleanFields(value, tableName);
    
    // Values to insert/update
    const pkValue = cleanedValue[table.primaryKey];
    
    // Handle missing primary key
    if (pkValue === undefined || pkValue === null) {
      console.error(`[PGMQ ${tableName}] Missing primary key in data for msg_id ${msg_id}:`, value);
      throw new Error(`Missing primary key for table ${tableName}, msg_id ${msg_id}, operation ${opType}`);
    }
    
    // Map column values, defaulting to null for missing values
    // Only needed for INSERT/UPDATE
    let values: any[] = [];
    if (opType === 'INSERT' || opType === 'UPDATE') {
        values = columns.map(col => {
      const val = cleanedValue[col];
      return val === undefined ? null : val;
    });
    }

    let operation: { sql: string; params: any[] } | null = null;

    switch (opType) {
      case "INSERT": // Assuming pgmq type is uppercase
        operation = {
          sql: `INSERT OR REPLACE INTO ${tableName} (${table.columns.join(", ")}) VALUES (${table.columns.map(() => "?").join(", ")})`,
          params: [pkValue, ...values],
        };
        break;
      case "UPDATE": // Assuming pgmq type is uppercase
        operation = {
          sql: `UPDATE ${tableName} SET ${columns.map(col => `${col} = ?`).join(", ")} WHERE ${table.primaryKey} = ?`,
          params: [...values, pkValue],
        };
        break;
      case "DELETE": // Assuming pgmq type is uppercase
        operation = {
          sql: `DELETE FROM ${tableName} WHERE ${table.primaryKey} = ?`,
          params: [pkValue],
        };
        break;
      default:
        console.error(`[PGMQ ${tableName}] Unknown operation from pgmq message type: ${opType} in msg_id ${msg_id}`);
        throw new Error(`Unknown operation type: ${opType}`);
    }

    if (operation) {
      // console.log(`[PGMQ ${tableName}] Generated SQL operation for msg_id ${msg_id}:`, JSON.stringify(operation, jsonReplacer, 2));
    } else {
       console.log(`[PGMQ ${tableName}] No SQL operation generated for message msg_id ${msg_id}.`);
    }
    return operation;

  } catch (error) {
    // Log only essential parts on error to avoid large logs
    console.error(`[PGMQ ${tableName}] Error handling message msg_id ${msg_id}:`, error, "PK:", value?.[table.primaryKey], "Operation:", opType);
    throw error; // Re-throw to be caught by the caller if necessary
  }
}

async function checkAndCreateTables(db: D1DatabaseSession) {
  const start = Date.now();
  console.log(`[DB Init] Starting database table check/creation...`);
  try {
    // Check each data table with a simple SELECT
    for (const table of Object.keys(TABLE_SCHEMAS)) {
      console.log(`[DB Init] Checking/Creating table: ${table}`);
      await ensureTableExists(db, table);
      console.log(`[DB Init] Table ${table} ensured.`);
    }
    console.log(`[DB Init] All tables checked/created in ${Date.now() - start}ms`);
  } catch (error) {
    console.error(`[DB Init] Error initializing database:`, error);
    throw error;
  }
}

async function ensureTableExists(db: D1DatabaseSession, table: string) {
  console.log(`[Ensure Table] Checking existence of table: ${table}`);
  try {
    // Try to select from the table
    await db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).first();
    console.log(`[Ensure Table] Table ${table} exists.`);
  } catch (error) {
    // If table doesn't exist, create it
    if (error instanceof Error && error.message.includes('no such table')) {
      console.log(`[Ensure Table] Table ${table} does not exist. Creating...`);
      
      const schema = TABLE_SCHEMAS[table as keyof typeof TABLE_SCHEMAS];

      if (!schema) {
        console.error(`[Ensure Table] Schema not found for table: ${table}`);
        throw new Error(`Schema not found for table: ${table}`);
      }
      // Format the SQL query to remove newlines and extra spaces
      const formattedSchema = schema.replace(/\s+/g, ' ').trim();
      console.log(`[Ensure Table] Creating table ${table} with query: "${formattedSchema}"`);
      try {
        await db.prepare(formattedSchema).run();
        console.log(`[Ensure Table] Table ${table} created successfully.`);
      } catch (creationError) {
        console.error(`[Ensure Table] Error executing CREATE TABLE for ${table}:`, creationError);
        throw creationError; // Re-throw creation error
      }
    } else {
      // Log other types of errors encountered during the check
      console.error(`[Ensure Table] Error checking table ${table}:`, error);
      throw error; // Re-throw unexpected error
    }
  }
}

// Constant-time comparison function to prevent timing attacks
async function constantTimeComparison(a: string, b: string): Promise<boolean> {
	const encoder = new TextEncoder();

	// Hash both strings using SHA-256 for better security
	const aHash = await crypto.subtle.digest('SHA-256', encoder.encode(a));
	const bHash = await crypto.subtle.digest('SHA-256', encoder.encode(b));

	// Compare the hashes in constant time
	return crypto.subtle.timingSafeEqual(aHash, bHash);
}

async function handleNuke(request: Request, env: Env) {
  console.log(`[Nuke] Received nuke request to ${request.url}`);
  if (request.method !== "POST") {
    console.log(`[Nuke] Invalid method: ${request.method}`);
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = request.headers.get("x-webhook-signature") ?? '';
  // Avoid logging the actual signature unless necessary for debugging
  const isValid = await constantTimeComparison(signature, env.WEBHOOK_SECRET);
  if (!isValid) {
    console.log(`[Nuke] Unauthorized access attempt.`);
    return new Response("Unauthorized", { status: 401 });
  }
  console.log(`[Nuke] Signature validated.`);

  let body: NukeRequest;
  try {
    body = await request.json() as NukeRequest;
    console.log(`[Nuke] Parsed request body:`, JSON.stringify(body, jsonReplacer));
  } catch (e) {
     console.error(`[Nuke] Error parsing request body:`, e);
     return new Response("Invalid request body", { status: 400 });
  }


  try {
    console.log(`[Nuke] Initializing database for nuke operation...`);
    // Initialize database ensures data tables exist
    await checkAndCreateTables(env.DB.withSession(`first-primary`));
    console.log(`[Nuke] Database initialized.`);
    
    let tableName: string | undefined = undefined;
    if (body.type === 'table') {
      tableName = body.table;
      if (!tableName || !TABLES.some(t => t.name === tableName)) {
        console.log(`[Nuke] Invalid table specified: ${tableName}`);
        return new Response(`Invalid table: ${tableName}`, { status: 400 });
      }
      
      // Locking removed, proceed directly
      console.log(`[Nuke Table ${tableName}] Proceeding without lock.`);
    }

    // Now proceed with nuking
    switch (body.type) {
      case 'all':
        console.log(`[Nuke All] Starting database nuke.`);
        await nukeDatabase(env.DB.withSession(`first-primary`));
        console.log(`[Nuke All] Database nuke complete.`);
        return new Response("Database nuked", { status: 200 });
      
      case 'table':
        // tableName is already validated and locked
        console.log(`[Nuke Table ${tableName}] Starting table nuke.`);
        await nukeTable(env.DB.withSession(`first-primary`), tableName!);
        console.log(`[Nuke Table ${tableName}] Table nuke complete.`);
        // No lock to release
        return new Response(`Table ${tableName} nuked`, { status: 200 });
      
      default:
        // This case should ideally not be reached if using TypeScript types properly
        console.error(`[Nuke] Invalid nuke type received: ${body.type}`);
        // Release lock if it was acquired for an invalid type somehow
        // if (tableName) await releaseLock(env.db.withSession(`first-primary`), tableName); // Removed lock call
        return new Response(`Invalid nuke type: ${body.type}`, { status: 400 });
    }
  } catch (error) {
    console.error("[Nuke] Error during nuke operation:", error);
    // No lock release needed here either
    return new Response(error instanceof Error ? error.message : "Internal server error during nuke", { status: 500 });
  }
}

async function nukeDatabase(db: D1DatabaseSession) {
  console.log(`[Nuke DB] Nuking database`);
  const start = Date.now();
  
  // Then nuke all actual data tables
  const tableNames = TABLES.map(t => t.name);
  console.log(`[Nuke DB] Nuking tables: ${tableNames.join(', ')}`);
  for (const tableName of tableNames) {
    await nukeTable(db, tableName);
  }
  
  console.log(`[Nuke DB] Database nuke completed in ${Date.now() - start}ms`);
}

async function nukeTable(db: D1DatabaseSession, tableName: string) {
  const start = Date.now();
  console.log(`[Nuke Table ${tableName}] Starting nuke process`);
  
  // Drop the table
  console.log(`[Nuke Table ${tableName}] Dropping table...`);
  try {
    await db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
    console.log(`[Nuke Table ${tableName}] Table dropped.`);
  } catch (dropError) {
     console.error(`[Nuke Table ${tableName}] Error dropping table:`, dropError);
     // Continue to recreate if drop failed (might not exist)
  }
  
  // Recreate the table
  const schema = TABLE_SCHEMAS[tableName as keyof typeof TABLE_SCHEMAS];
  if (!schema) {
     console.error(`[Nuke Table ${tableName}] Schema not found! Cannot recreate table.`);
     throw new Error(`Schema not found for table: ${tableName}`);
  }
  console.log(`[Nuke Table ${tableName}] Recreating table...`);
  try {
    await db.prepare(schema).run();
    console.log(`[Nuke Table ${tableName}] Table recreated.`);
  } catch (createError) {
     console.error(`[Nuke Table ${tableName}] Error recreating table:`, createError);
     throw createError; // Propagate if recreation fails
  }
  
  console.log(`[Nuke Table ${tableName}] Nuke process completed in ${Date.now() - start}ms`);
}

// Handles the /sync endpoint trigger
async function handleSyncRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const handlerStart = Date.now();
  console.log(`[Sync Request] Received trigger to process replication queue.`);
  
  // Validate request method
  if (request.method !== "POST") {
    console.log(`[Sync Request] Invalid method: ${request.method}`);
    return new Response("Method not allowed", { status: 405 });
  }
  
  // Validate signature using constant-time comparison
  const signature = request.headers.get("x-webhook-signature");
  if (!signature) {
    console.log(`[Sync Request] Missing webhook signature.`);
    return new Response("Unauthorized", { status: 401 });
  }

  const isValid = await constantTimeComparison(signature, env.WEBHOOK_SECRET);
  if (!isValid) {
    console.log(`[Sync Request] Unauthorized access attempt.`);
    return new Response("Unauthorized", { status: 401 });
  }
  console.log(`[Sync Request] Signature validated.`);
  
  // No body needed, just trigger the queue processing

  try {
    // Ensure tables exist (including sync_pgmq_state) before scheduling background task
    await checkAndCreateTables(env.DB.withSession(`first-primary`));
    console.log(`[Sync Request] Database tables checked/ensured. Scheduling background processing. Time: ${Date.now() - handlerStart}ms`);

    // Run the queue processing in the background using waitUntil
    ctx.waitUntil(
      (async () => {
        console.log(`[Background Queue Sync] Starting background execution.`);
        try {
          await processReplicationQueue(env.DB.withSession(`first-primary`), env);
          console.log(`[Background Queue Sync] Background execution finished successfully.`);
        } catch (error) {
          // Log error from the background task
          console.error(`[Background Queue Sync] Error during background execution: ${error}`);
        }
      })()
    );
    
    // Return success immediately
    console.log(`[Sync Request] Responding 202 Accepted. Time: ${Date.now() - handlerStart}ms`);
    return new Response("Replication queue processing scheduled", { status: 202 });

  } catch (error) {
    // Catch errors from validation, table checking, or scheduling
    console.error("[Sync Request] Error handling sync request trigger:", error);
    return new Response(error instanceof Error ? error.message : "Internal server error during sync request trigger", { status: 500 });
  }
}

// Renamed from processPgmqMessages - Processes the single replication queue
async function processReplicationQueue(db: D1DatabaseSession, env: Env) {
    const queueKey = 'replicate_data'; // Using queue name for logging consistency
    const startTime = Date.now();
    console.log(`[${queueKey}] Starting replication queue processing at ${startTime}.`);
    
    // let pgPool: Pool | null = null; // Removed pg Pool
    // let pgClient: PoolClient | null = null; // Removed pg Client
    let sql: postgres.Sql | null = null; // postgres instance
    let processedMsgCount = 0;
    let lastSuccessfullyProcessedMsgId = -1; // Track the last ID successfully processed *before* batch commit
    let currentBatch: D1PreparedStatement[] = [];
    let highestMsgIdRead = -1; // Track the highest message ID read in this run
    const successfullyProcessedMsgIds: bigint[] = []; // Collect IDs for deletion
    const highReadCountMsgIds: bigint[] = []; // Collect IDs for archiving due to high read count
    let batchMsgIds: bigint[] = []; // Track IDs in the current D1 batch

    try {
        // 2. Create PostgreSQL connection using Hyperdrive
        if (!env.HYPERDRIVE_DB) {
             console.error(`[${queueKey}] Hyperdrive binding HYPERDRIVE_DB not configured.`);
             throw new Error("Hyperdrive binding HYPERDRIVE_DB not configured.");
        }
        // Create postgres instance using the Hyperdrive connection string
        sql = postgres(env.HYPERDRIVE_DB.connectionString, {
            prepare: false, // Use simple query protocol
            idle_timeout: 2, // Close idle connections after 2 seconds
            onnotice: (notice: postgres.Notice) => { console.log(`[${queueKey}] PG Notice:`, notice.message); }, // Added Notice type
        });
        console.log(`[${queueKey}] PostgreSQL connection handler created via Hyperdrive.`);

        // No explicit connect needed, postgres handles it

        // 3. Read messages from the single replication queue
        const queueName = 'replicate_data'; // Fixed queue name
        const visibilityTimeout = 60; // Visibility timeout in seconds

        console.log(`[${queueKey}] Reading messages from queue: ${queueName}`);
        
        // Read a batch of messages using postgres sql tag
        let messages = [];
        try {
            // Use tagged template literal for safe query construction
            messages = await sql`
                SELECT msg_id, message, read_ct 
                FROM pgmq.read(${queueName}, ${visibilityTimeout}, ${BATCH_SIZE})
            `;
        } catch (readError) {
             console.error(`[${queueKey}] Error reading from pgmq queue ${queueName}:`, readError);
             throw readError;
        }

        if (!messages || messages.length === 0) {
            console.log(`[${queueKey}] No new messages found in queue ${queueName}.`);
            return; // Nothing to process
        }

        console.log(`[${queueKey}] Received ${messages.length} messages from queue ${queueName}.`);
        highestMsgIdRead = messages[messages.length - 1].msg_id; // Store highest ID read

        // 4. Loop through messages:
        let currentMsgId = -1;
        for (const pgmqMsg of messages) {
            currentMsgId = pgmqMsg.msg_id;
            const currentMsgIdBigInt = BigInt(currentMsgId); // Convert to BigInt early
            if (pgmqMsg.read_ct > 5) {
                console.log(`[${queueKey}] Skipping msg_id ${currentMsgId} due to high read count (${pgmqMsg.read_ct}).`);
                highReadCountMsgIds.push(currentMsgIdBigInt);
                processedMsgCount++;
                continue;
            }

            try {
                // a. Parse message content & get target table
                const msgContent = pgmqMsg.message;
                const targetTableName = msgContent?.table;
                if (!targetTableName) {
                     console.error(`[${queueKey}] Message missing target table name in msg_id ${currentMsgId}:`, msgContent);
                     throw new Error(`Message missing target table name, msg_id ${currentMsgId}`);
                }
                
                // Find the schema for the target table
                const tableSchema = TABLES.find(t => t.name === targetTableName);
                 if (!tableSchema) {
                    console.error(`[${queueKey}] Unknown table schema for table '${targetTableName}' in msg_id ${currentMsgId}. Skipping.`);
                    // Decide how to handle: skip or error out?
                    // Skipping allows other messages to process, but this message is lost.
                    // Erroring out stops processing, requires manual fix for the schema.
                    // For now, log and skip, treating as processed for deletion purposes.
                     successfullyProcessedMsgIds.push(currentMsgIdBigInt); // Add skipped ID for deletion
                     processedMsgCount++; // Count as processed even if skipped
                     continue; // Skip this message
                }

                // b. Use handleMessage to create D1 statement
                const sqlOperation = handleMessage(pgmqMsg, tableSchema);
                
                if (sqlOperation) {
                    // c. Add statement to batch
                    currentBatch.push(db.prepare(sqlOperation.sql).bind(...sqlOperation.params));
                    batchMsgIds.push(currentMsgIdBigInt); // Add ID to current batch tracker
                    
                    // d. If D1 batch size reached, execute batch
                    if (currentBatch.length >= BATCH_SIZE) {
                        console.log(`[${queueKey}] D1 batch size (${BATCH_SIZE}) reached at msg_id ${currentMsgId}. Executing batch...`);
                        await db.batch(currentBatch);
                        console.log(`[${queueKey}] D1 batch executed successfully.`);
                        // Add successfully committed batch IDs to the main list
                        successfullyProcessedMsgIds.push(...batchMsgIds);
                        currentBatch = []; // Reset batch
                        batchMsgIds = []; // Reset batch ID tracker
                        // NOTE: We don't delete here yet, delete in bulk at the end
                    }
                } else {
                    // Handle cases where handleMessage returns null (e.g., unknown op type)
                    console.warn(`[${queueKey}] No D1 operation generated for msg_id ${currentMsgId}. It will be skipped but deleted.`);
                    // Treat as processed for deletion purposes
                    successfullyProcessedMsgIds.push(currentMsgIdBigInt); // Add skipped ID for deletion
                }
            } catch (messageError) {
                console.error(`[${queueKey}] Error processing msg_id ${currentMsgId}:`, messageError);
                // Stop processing further messages on error to ensure order
                break;
            }
            processedMsgCount++;
        } // End loop through messages

        // 5. Execute remaining batch
        if (currentBatch.length > 0) {
            console.log(`[${queueKey}] Executing final D1 batch of ${currentBatch.length} items...`);
            await db.batch(currentBatch);
            console.log(`[${queueKey}] Final D1 batch executed successfully.`);
            // Add remaining successfully committed batch IDs
            successfullyProcessedMsgIds.push(...batchMsgIds);
        }
        
        // 6. Delete processed messages in pgmq
        // Delete all messages that were successfully processed or skipped *in this run*
        if (successfullyProcessedMsgIds.length > 0) {
            console.log(`[${queueKey}] Deleting ${successfullyProcessedMsgIds.length} processed/skipped messages from queue ${queueName}...`, successfullyProcessedMsgIds);
            // Use the pgmq.delete version that accepts a bigint[] array
            try {
                // Use sql.unsafe with proper escaping for the array parameter
                // Since BigInts are safe and we're joining them, this is secure
                const idsArrayLiteral = `ARRAY[${successfullyProcessedMsgIds.join(',')}]::bigint[]`;
                await sql.unsafe(`SELECT pgmq.delete($1::text, ${idsArrayLiteral})`, [queueName]);
                 console.log(`[${queueKey}] Successfully deleted processed/skipped messages.`);
            } catch (deleteError) {
                 console.error(`[${queueKey}] Error deleting processed/skipped messages from queue ${queueName}:`, deleteError, "IDs:", successfullyProcessedMsgIds);
                 // Critical error: D1 is updated, but messages not deleted. Might lead to reprocessing.
                 // Throw error
                 throw deleteError;
            }
            
        } else {
            // This case means no messages were processed (e.g., all failed before first commit, or read batch was empty)
            console.log(`[${queueKey}] No messages were successfully processed or skipped in this run. No deletion needed.`);
        }

        // Archive messages with high read count
        if (highReadCountMsgIds.length > 0) {
            console.log(`[${queueKey}] Archiving ${highReadCountMsgIds.length} messages with high read count from queue ${queueName}...`, highReadCountMsgIds);
            try {
                // Use sql.unsafe with proper escaping for the array parameter
                // Since BigInts are safe and we're joining them, this is secure
                const idsArrayLiteral = `ARRAY[${highReadCountMsgIds.join(',')}]::bigint[]`;
                await sql.unsafe(`SELECT pgmq.archive($1::text, ${idsArrayLiteral})`, [queueName]);
                console.log(`[${queueKey}] Successfully archived messages with high read count.`);
            } catch (archiveError) {
                console.error(`[${queueKey}] Error archiving messages with high read count from queue ${queueName}:`, archiveError, "IDs:", highReadCountMsgIds);
                throw archiveError;
            }
        }

    } catch (error) {
        console.error(`[${queueKey}] Error processing messages:`, error);
    } finally {
        // Release the client back to the pool (handled by postgres.js automatically)
        // if (pgClient) {
        //     pgClient.release();
        //     console.log(`[${queueKey}] PostgreSQL client released.`);
        // }
        // End the postgres connection pool gracefully
        if (sql) {
            await sql.end({ timeout: 5 }); // Add a timeout for ending
            console.log(`[${queueKey}] PostgreSQL connection pool ended.`);
        }
        console.log(`[${queueKey}] Finished processing ${processedMsgCount} messages (up to highest read ID: ${highestMsgIdRead}) in ${Date.now() - startTime}ms. ${successfullyProcessedMsgIds.length} messages marked for deletion.`);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    console.log(`[Fetch] Received request: ${request.method} ${path}`);
    
    
    try {
        if (path === "/nuke") {
          return await handleNuke(request, env);
        }
        
        // Added back /sync endpoint to trigger queue processing
        if (path === "/sync") {
          return await handleSyncRequest(request, env, ctx);
        }

        if (path === "/health") {
          console.log(`[Fetch] Responding to /health check`);
          return new Response("OK", { status: 200 });
        }
        
        console.log(`[Fetch] Path not found: ${path}`);
        return new Response("Not found", { status: 404 });

    } catch (error) {
       console.error(`[Fetch] Unhandled error in fetch handler for path ${path}:`, error);
       return new Response("Internal Server Error", { status: 500 });
    }
  },
};
