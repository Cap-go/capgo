import type { RunnableTest, SupabaseType } from '../../utils.ts'
import { testPlaywright } from '../../utils.ts'

const TEST2UUID = 'f851c669-5fc3-4d44-b862-f1438aec7383'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test selectable disallow',
    testWithRedis: false,
    tests: [
      {
        name: 'Test selectable disallow frontend',
        test: testSelectableDisallowFront,
        timesToExecute: 1,
      },
    ],
  }
}

async function testSelectableDisallowFront(_backendBaseUrl: URL, _supabase: SupabaseType) {
  await testPlaywright('selectable_disallow.spec', {})
}
