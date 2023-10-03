import type { RunnableTest, SupabaseType } from '../../utils.ts'
import { assert, testPlaywright } from '../../utils.ts'

const TEST2UUID = 'f851c669-5fc3-4d44-b862-f1438aec7383'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test selectable disallow',
    testWithRedis: false,
    tests: [
      {
        name: 'Prepare selectable disallow test',
        test: prepareTest,
        timesToExecute: 1,
      },
      {
        name: 'Test selectable disallow frontend',
        test: testSelectableDisallowFront,
        timesToExecute: 1,
      },
    ],
  }
}

async function prepareTest(_backendBaseUrl: URL, supabase: SupabaseType) {
  // Make the channels major allways
  // We disable ab testing so that the second test can safely enable it
  const { data: data1, error: error1 } = await supabase.from('channels')
    .update({ disableAutoUpdate: 'major', enableAbTesting: false })
    .or('id.eq.22')
    .or('id.eq.23')
    .select('*')

  assert(error1 === null, `Supabase channel error ${JSON.stringify(error1)} is not null`)
  assert(data1 !== null, `Supabase channel data ${JSON.stringify(data1)} is null`)
  assert(data1!.length === 2, `Supabase channel data ${JSON.stringify(data1)} length is not 2`)

  // Make the versions allways have no minVersionUpdate metadata
  const { error: error2 } = await supabase.from('app_versions')
    .update({ minUpdateVersion: null })
    .or(`id.eq.${data1![0].version}`)
    .or(`id.eq.${data1![1].version}`)

  assert(error2 === null, `Supabase app_versions error ${JSON.stringify(error2)} is not null`)
}

async function testSelectableDisallowFront(_backendBaseUrl: URL, _supabase: SupabaseType) {
  await testPlaywright('selectable_disallow.spec', {})
}
