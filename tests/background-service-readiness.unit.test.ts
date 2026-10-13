import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'

const quote = (value: string) => `'${value.replaceAll('\'', '\'\\\'\'')}'`

it.skipIf(process.platform === 'win32').each([
  { description: 'waits for its own service even when the previous service passes the HTTP check', ready: true, exits: false },
  { description: 'fails within the startup budget when its own service never becomes ready', ready: false, exits: false },
  { description: 'fails if its own service exits after the banner while the previous service passes the HTTP check', ready: true, exits: true },
])('$description', ({ ready, exits }) => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'background-readiness-'))
  const output = path.join(fixture, 'output')
  const log = path.join(fixture, 'service.log')
  const child = path.join(fixture, 'service.cjs')
  writeFileSync(child, `${ready ? 'setTimeout(() => console.log(\'fixture service ready\'), 1800);' : ''} ${exits ? 'setTimeout(() => process.exit(0), 2000);' : ''} setInterval(() => {}, 1000)`)
  // Model the old runtime's already-successful health response.
  writeFileSync(path.join(fixture, 'bunx'), `#!/bin/sh\n${exits ? 'sleep 0.6\n' : ''}exit 0\n`, { mode: 0o755 })
  try {
    const result = spawnSync('bash', ['.github/scripts/start-background-service.sh'], {
      encoding: 'utf8',
      timeout: 8000,
      env: {
        ...process.env,
        PATH: `${fixture}${path.delimiter}${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        BACKGROUND_SERVICE_NAME: 'Readiness fixture',
        BACKGROUND_RUN_COMMAND: `exec ${quote(process.execPath)} ${quote(child)}`,
        BACKGROUND_LOG_PATH: log,
        BACKGROUND_WAIT_ON: 'http-get://previous-runtime.example.com/ok',
        BACKGROUND_READY_LOG_TEXT: 'fixture service ready',
        BACKGROUND_WAIT_TIMEOUT_MS: ready ? '5000' : '1000',
      },
    })
    expect(result.status, result.stderr).toBe(ready && !exits ? 0 : 1)
    if (ready && !exits) {
      expect(readFileSync(log, 'utf8')).toContain('fixture service ready')
      expect(result.stdout).toContain('is ready')
    }
    else {
      expect(result.stderr).toContain(exits ? 'exited before it became ready' : 'did not emit its readiness banner')
      expect(result.stdout).not.toContain('is ready')
    }
  }
  finally {
    const pid = Number(readFileSync(output, 'utf8').match(/^pid=(\d+)$/m)?.[1])
    if (pid) {
      try {
        process.kill(pid)
      }
      catch {}
    }
    rmSync(fixture, { recursive: true, force: true })
  }
})
