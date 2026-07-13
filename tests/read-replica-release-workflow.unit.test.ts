import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL(
  "../.github/workflows/build_and_deploy.yml",
  import.meta.url,
);

async function readReleaseWorkflow(): Promise<string> {
  return readFile(workflowUrl, "utf8");
}

describe("production read-replica release gate", () => {
  it.concurrent(
    "preflights Cloud SQL Data API before primary migrations and reconciles with OIDC",
    async () => {
      const workflow = await readReleaseWorkflow();

      expect(workflow).toContain(
        "Verify Cloud SQL Data API before primary migration",
      );
      expect(workflow).toContain("gcloud sql instances execute-sql");
      expect(workflow).toContain("google-github-actions/auth@v3");
      expect(workflow).toContain("GOOGLE_WORKLOAD_IDENTITY_PROVIDER");
      expect(workflow).toContain("GOOGLE_READ_REPLICA_INSTANCE: eu-2");
      expect(workflow).not.toContain("READ_REPLICATE_GOOGLE_EU1");
      expect(workflow).not.toContain("check-read-replica-hyperdrive-schema");
      expect(workflow).toContain("bun scripts/sync-read-replica-schema.ts");
    },
  );

  it.concurrent(
    "holds downstream release publishing behind the replica gate",
    async () => {
      const workflow = await readReleaseWorkflow();

      for (const job of [
        "deploy_webapp",
        "deploy_api",
        "deploy_translation_worker",
        "deploy_files",
        "deploy_plugin_regions",
      ]) {
        expect(workflow).toContain(
          `  ${job}:\n    needs: [changes, supabase_deploy, read_replica_schema]`,
        );
      }
    },
  );
});
