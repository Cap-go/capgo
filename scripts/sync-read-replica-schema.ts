import process from "node:process";
import { reconcileReadReplicaSchema } from "../read_replicate/schema_additive_sync.ts";
import {
  READ_REPLICA_SCHEMA_CATALOG_SQL,
  type Queryable,
  stableStringify,
} from "../read_replicate/schema_catalog.ts";

const DEFAULT_SYNC_MAX_SECONDS = 30 * 60;
const CATALOG_QUERY_BUFFER_MS = 5000;
const GOOGLE_DATA_API_MAX_SECONDS = 30;

interface DataApiResponse {
  results?: Array<{
    columns?: Array<{ name?: string }>;
    rows?: Array<{ values?: Array<{ value?: string; nullValue?: boolean }> }>;
  }>;
}

async function main(): Promise<void> {
  const maxDurationMs =
    positiveSecondsFromEnv(
      "READ_REPLICA_SCHEMA_SYNC_MAX_TIME",
      DEFAULT_SYNC_MAX_SECONDS,
    ) * 1000;
  const deadline = Date.now() + maxDurationMs;
  const result = await reconcileReadReplicaSchema(
    linkedPrimaryCatalogClient(deadline),
    googleDataApiClient(deadline),
    {
      deadline,
      maxDurationMs,
      statementTimeoutMs: GOOGLE_DATA_API_MAX_SECONDS * 1000,
    },
  );

  if (result.issues.length) {
    console.error(
      "::error title=Read-replica schema did not converge::Cloud SQL Data API reconciliation completed with residual drift.",
    );
    console.error(
      stableStringify({ error: "schema_not_converged", ...result }),
    );
    process.exitCode = 1;
    return;
  }

  console.log("Read-replica Cloud SQL Data API sync result:");
  console.log(stableStringify(result));
  console.log(
    "Read replica now matches the live primary schema for the selected tables.",
  );
}

function linkedPrimaryCatalogClient(deadline: number): Queryable {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    throw new Error(
      "Set SUPABASE_ACCESS_TOKEN after linking the Supabase project for live primary schema reads.",
    );
  }

  return {
    async query(queryText: string, values?: unknown[]) {
      if (queryText !== READ_REPLICA_SCHEMA_CATALOG_SQL) {
        throw new Error(
          "Linked primary access is restricted to the read-replica schema catalog query.",
        );
      }
      return queryLinkedPrimaryCatalog(
        renderCatalogQueryWithStaticValues(queryText, values),
        deadline,
      );
    },
  };
}

function googleDataApiClient(deadline: number): Queryable {
  const project = requiredEnv("GOOGLE_CLOUD_PROJECT");
  const instance = requiredEnv("GOOGLE_READ_REPLICA_INSTANCE");
  const database = requiredEnv("GOOGLE_READ_REPLICA_DATABASE");

  return {
    async query(queryText: string, values?: unknown[]) {
      // Data API has no session affinity. Its fixed 30-second request limit applies.
      if (
        queryText.startsWith("SET statement_timeout") ||
        queryText === "RESET statement_timeout"
      )
        return { rows: [] };

      const sql =
        queryText === READ_REPLICA_SCHEMA_CATALOG_SQL
          ? renderCatalogQueryWithStaticValues(queryText, values)
          : queryText;
      return {
        rows: dataApiRows(
          await executeGoogleSql(project, instance, database, sql, deadline),
        ),
      };
    },
  };
}

async function executeGoogleSql(
  project: string,
  instance: string,
  database: string,
  sql: string,
  deadline: number,
): Promise<DataApiResponse> {
  const child = Bun.spawn(
    [
      "gcloud",
      "sql",
      "instances",
      "execute-sql",
      instance,
      `--project=${project}`,
      `--database=${database}`,
      `--sql=${sql}`,
      "--format=json",
      "--quiet",
    ],
    { stdout: "pipe", stderr: "pipe", env: process.env },
  );
  let timedOut = false;
  const timeout = setTimeout(
    () => {
      timedOut = true;
      child.kill();
    },
    Math.min(remainingBudgetMs(deadline), GOOGLE_DATA_API_MAX_SECONDS * 1000),
  );

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (timedOut)
      throw new Error(
        "Cloud SQL Data API request exceeded its 30-second execution limit.",
      );
    if (exitCode !== 0)
      throw new Error(
        `Cloud SQL Data API query failed: ${commandOutput(stderr || stdout)}`,
      );
    return JSON.parse(stdout) as DataApiResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function dataApiRows(response: DataApiResponse): Record<string, any>[] {
  const result = response.results?.[0];
  const columns = result?.columns ?? [];
  return (result?.rows ?? []).map((row) => {
    const mapped: Record<string, any> = {};
    for (const [index, column] of columns.entries()) {
      const value = row.values?.[index];
      if (!column.name) continue;
      if (value?.nullValue) {
        mapped[column.name] = null;
        continue;
      }
      mapped[column.name] =
        column.name === "catalog" && value?.value
          ? JSON.parse(value.value)
          : value?.value;
    }
    return mapped;
  });
}

async function queryLinkedPrimaryCatalog(
  sql: string,
  deadline: number,
): Promise<{ rows: Record<string, any>[] }> {
  const child = Bun.spawn(
    [
      "supabase",
      "db",
      "query",
      "--linked",
      "--agent=no",
      "--output",
      "json",
      sql,
    ],
    { stdout: "pipe", stderr: "pipe", env: process.env },
  );
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, remainingBudgetMs(deadline));

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (timedOut)
      throw new Error(
        "Read-replica schema sync exceeded max duration while reading the live primary schema catalog.",
      );
    if (exitCode !== 0)
      throw new Error(
        `Linked primary schema catalog query failed: ${commandOutput(stderr || stdout)}`,
      );
    const parsed = JSON.parse(stdout) as unknown;
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (row) => row !== null && typeof row === "object" && !Array.isArray(row),
      )
    )
      throw new Error(
        "Linked primary schema catalog query returned an invalid JSON row array.",
      );
    return { rows: parsed as Record<string, any>[] };
  } finally {
    clearTimeout(timeout);
  }
}

function renderCatalogQueryWithStaticValues(
  queryText: string,
  values: unknown[] | undefined,
): string {
  const parameters = values ?? [];
  if (parameters.length !== 5)
    throw new Error(
      "Read-replica schema catalog requires five selected-schema parameter arrays.",
    );
  let sql = queryText;
  for (const [index, value] of parameters.entries()) {
    const placeholder = `$${index + 1}::text[]`;
    if (!sql.includes(placeholder))
      throw new Error(
        "Read-replica schema catalog query did not contain its expected parameter placeholders.",
      );
    sql = sql.replaceAll(placeholder, postgresTextArray(value));
  }
  return sql;
}

function postgresTextArray(value: unknown): string {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  )
    throw new Error(
      "Read-replica schema catalog parameters must be arrays of selected object names.",
    );
  return `ARRAY[${value.map(quoteSqlText).join(", ")}]::text[]`;
}

function quoteSqlText(value: string): string {
  if (value.includes("\0"))
    throw new Error(
      "Read-replica schema catalog parameters cannot contain null bytes.",
    );
  return `'${value.replaceAll("'", "''")}'`;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Set ${name} for Cloud SQL Data API reconciliation.`);
  return value;
}

function remainingBudgetMs(deadline: number): number {
  const remainingMs = deadline - Date.now() - CATALOG_QUERY_BUFFER_MS;
  if (remainingMs <= 0)
    throw new Error(
      "Read-replica schema sync exceeded max duration before it could read the schema catalog.",
    );
  return remainingMs;
}

function commandOutput(value: string): string {
  const message = value.trim().replaceAll(/\s+/g, " ");
  return message ? message.slice(0, 4096) : "no diagnostic output";
}

function positiveSecondsFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) <= 0)
    throw new Error(`${name} must be a positive integer number of seconds.`);
  return Number(value);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error title=Read-replica Data API sync failed::${message}`);
  process.exitCode = 1;
}
