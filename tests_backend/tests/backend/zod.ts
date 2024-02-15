import { type RunnableTest, type SupabaseType, runSubprocess } from '../../utils.ts'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test updates endpoint',
    tests: [
      {
        name: 'Test ZOD',
        test: testZod,
        timesToExecute: 1,
      },
    ],
  }
}

async function testZod(_backendBaseUrl: URL, supabase: SupabaseType) {
  const zodCommand = new Deno.Command('deno', {
    args: [
      'test',
      '--allow-all',
      'tests_backend/zod.test.ts',
    ],
    stdout: 'piped',
    stderr: 'piped',
  })

  await runSubprocess(zodCommand, 'Zod test')
}
