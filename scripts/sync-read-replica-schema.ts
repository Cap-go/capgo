import { readFile } from "node:fs/promises";
import process from "node:process";
import { applyReadReplicaSchemaSync } from "../read_replicate/schema_additive_sync.ts";
import {
  READ_REPLICA_SCHEMA_CATALOG_SQL,
  readReplicaSchemaCatalog,
  type Queryable,
  stableStringify,
} from "../read_replicate/schema_catalog.ts";
import { readReplicaSchemaCompatibilityIssues } from "../read_replicate/schema_compatibility.ts";

const DEFAULT_SYNC_MAX_SECONDS = 30 * 60;
const CATALOG_QUERY_BUFFER_MS = 5000;
const GOOGLE_DATA_API_MAX_SECONDS = 30;

interface DataApiResponse {
  results?: Array<{
    columns?: Array<{ name?: string }>;
    rows?: Array<{ values?: Array<{ value?: string; nullValue?: boolean }> }>;
  }>;
}

interface GoogleDataApiConfig {
  project: string;
  instance: string;
  database: string;
}
async function main(): Promise<void> {
  const maxDurationMs = DEFAULT_SYNC_MAX_SECONDS * 1000;
  const deadline = Date.now() + maxDurationMs;
  const expected = await readExpectedReplicaCatalog();
  const replica = googleDataApiClient(
    googleDataApiConfigFromArgs(process.argv.slice(2)),
    deadline,
  );
  const result = await applyReadReplicaSchemaSync(replica, expected, {
    deadline,
    maxDurationMs,
    statementTimeoutMs: GOOGLE_DATA_API_MAX_SECONDS * 1000,
  });
  const actual = await readReplicaSchemaCatalog(replica);
  const issues = readReplicaSchemaCompatibilityIssues(expected, actual);

  if (issues.length) {
    console.error(
      "::error title=Read-replica schema did not converge::Cloud SQL Data API reconciliation completed with residual drift.",
    );
    console.error(
      stableStringify({ error: "schema_not_converged", ...result, issues }),
    );
    process.exitCode = 1;
    return;
  }

  console.log("Read-replica Cloud SQL Data API sync result:");
  console.log(stableStringify({ ...result, issues }));
  console.log(
    "Read replica matches the committed selected schema before primary migrations.",
  );
}

async function readExpectedReplicaCatalog(): Promise<unknown> {
  return JSON.parse(
    await readFile(
      new URL(
        "../read_replicate/schema_replicate.catalog.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as unknown;
}
function googleDataApiClient(
  config: GoogleDataApiConfig,
  deadline: number,
): Queryable {
  const { project, instance, database } = config;

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

function googleDataApiConfigFromArgs(args: string[]): GoogleDataApiConfig {
  return {
    project: requiredOption(args, "--google-cloud-project"),
    instance: requiredOption(args, "--google-read-replica-instance"),
    database: requiredOption(args, "--google-read-replica-database"),
  };
}

function requiredOption(args: string[], option: string): string {
  const index = args.indexOf(option);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`Pass ${option} for Cloud SQL Data API reconciliation.`);
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

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error title=Read-replica Data API sync failed::${message}`);
  process.exitCode = 1;
}
