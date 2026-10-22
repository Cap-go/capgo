import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

it('bounds preview cleanup concurrency and duration while tolerating missing bundles', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/capgo_pr_preview.yml', import.meta.url), 'utf8'))
  const step = workflow.jobs.deploy.steps.find((step: { name?: string }) => step.name === 'Delete orphaned PR preview bundles')
  const output = execFileSync('bash', ['-c', `
    timeout() {
      printf 'timeout %s %s\n' "$1" "$2"
      shift 2
      "$@"
    }
    bunx() {
      printf 'start %s\n' "$4"
      sleep 0.05
      printf 'end %s\n' "$4"
      return 1
    }
    ${step.run}
  `], {
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      GITHUB_RUN_NUMBER: '100',
      BASE_VERSION: '1.0.0',
      PR_NUMBER: '123',
      CAPGO_CLI: '@capgo/cli@latest',
      CAPGO_TOKEN: 'fake-preview-token',
      APP_ID: 'com.example.preview',
    },
  })

  let active = 0
  let peak = 0
  const bundles: string[] = []
  const timeouts: string[] = []
  for (const line of output.trim().split('\n')) {
    const [event, value] = line.split(' ')
    if (event === 'start') {
      bundles.push(value)
      peak = Math.max(peak, ++active)
    }
    else if (event === 'end') {
      active--
    }
    else if (event === 'timeout') {
      timeouts.push(line.slice('timeout '.length))
    }
  }

  const expectedBundles = Array.from({ length: 9 }, (_, run) =>
    [1, 2, 3].map(attempt => `1.0.0-pr.123.${run + 92}.${attempt}`)).flat()
  expect(bundles.sort()).toEqual(expectedBundles.sort())
  expect(active).toBe(0)
  expect(peak).toBeGreaterThan(1)
  expect(peak).toBeLessThanOrEqual(6)
  expect(timeouts).toEqual(Array.from({ length: 27 }, () => '--kill-after=5s 45s'))
  expect(Math.ceil(bundles.length / 6) * 50).toBeLessThan(step['timeout-minutes'] * 60)
})
