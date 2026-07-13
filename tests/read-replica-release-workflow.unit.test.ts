import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const workflowUrl = new URL('../.github/workflows/build_and_deploy.yml', import.meta.url)

async function readReleaseWorkflow(): Promise<string> {
  return readFile(workflowUrl, 'utf8')
}

describe('production read-replica release gate', () => {
  it.concurrent('reconciles every stable release after primary migrations', async () => {
    const workflow = await readReleaseWorkflow()

    expect(workflow).toContain('  read_replica_schema:')
    expect(workflow).toContain('    needs: [changes, supabase_deploy]')
    expect(workflow).toContain("!contains(github.ref_name, '-alpha')")
    expect(workflow).toContain('      - name: Require direct subscriber connection')
    expect(workflow).toContain('READ_REPLICATE_GOOGLE_EU1')
    expect(workflow).toContain('bun scripts/sync-read-replica-schema.ts')
    expect(workflow).toContain('bun run readreplicate:check-hyperdrive-schema')
  })

  it.concurrent('holds downstream release publishing behind the replica gate', async () => {
    const workflow = await readReleaseWorkflow()

    for (const job of [
      'deploy_webapp',
      'deploy_api',
      'deploy_translation_worker',
      'deploy_files',
      'deploy_plugin_regions',
    ]) {
      expect(workflow).toContain(`  ${job}:\n    needs: [changes, supabase_deploy, read_replica_schema]`)
    }
  })
})
