import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL(
  "../.github/workflows/build_and_deploy.yml",
  import.meta.url,
);
const syncScriptUrl = new URL(
  "../scripts/sync-read-replica-schema.ts",
  import.meta.url,
);

async function readReleaseWorkflow(): Promise<string> {
  return readFile(workflowUrl, "utf8");
}

async function readReplicaSyncScript(): Promise<string> {
  return readFile(syncScriptUrl, "utf8");
}

describe("production read-replica release gate", () => {
  it.concurrent(
    "reconciles the committed catalog through Data API before primary migrations",
    async () => {
      const [workflow, syncScript] = await Promise.all([
        readReleaseWorkflow(),
        readReplicaSyncScript(),
      ]);

      expect(workflow).toContain("google-github-actions/auth@v3");
      expect(workflow).toContain(
        "${{ vars.GOOGLE_WORKLOAD_IDENTITY_PROVIDER }}",
      );
      expect(workflow).toContain("${{ vars.GOOGLE_SERVICE_ACCOUNT }}");
      expect(workflow).toContain("${{ vars.GOOGLE_CLOUD_PROJECT }}");
      expect(workflow).toContain("${{ vars.GOOGLE_READ_REPLICA_INSTANCE }}");
      expect(workflow).toContain("${{ vars.GOOGLE_READ_REPLICA_DATABASE }}");
      expect(workflow).not.toContain("GOOGLE_READ_REPLICA_INSTANCE: eu-2");
      expect(workflow).not.toContain("READ_REPLICATE_GOOGLE_EU1");
      expect(workflow).not.toContain("check-read-replica-hyperdrive-schema");
      expect(workflow).not.toContain("\nenv:\n  GOOGLE_");
      expect(workflow).toContain(
        "read_replica_schema:\n    needs: changes\n    if: ${{ needs.changes.result == 'success' && !contains(github.ref_name, '-alpha') }}",
      );
      expect(workflow).toContain(
        "supabase_deploy:\n    needs: [changes, read_replica_schema]",
      );
      expect(syncScript).toContain("applyReadReplicaSchemaSync");
      expect(syncScript).toContain("readReplicaSchemaCompatibilityIssues");
      expect(syncScript).toContain("gcloud");
      expect(syncScript).toContain("schema_replicate.catalog.json");
      expect(syncScript).not.toContain("supabase");
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
