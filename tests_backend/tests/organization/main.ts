import type { RunnableTest, SupabaseType } from '../../utils.ts'
import { testPlaywright } from '../../utils.ts'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test organization system',
    tests: [{
      name: 'Test organization system frontend',
      test: runFrontendTests,
      timesToExecute: 1,
    }],
  }
}

async function runFrontendTests(backendBaseUrl: URL, supabase: SupabaseType) {
  await testPlaywright('organization_system.spec.ts', backendBaseUrl, {})
}
