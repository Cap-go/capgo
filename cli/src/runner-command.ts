const RUNNER_WHITESPACE_RE = /\s+/g

const allowedRunnerCommands = new Set([
  'bunx',
  'npx',
  'pnpm exec',
  'yarn dlx',
])

export function formatRunnerCommand(runner: string, args: string[]): string {
  return `${runner} ${args.join(' ')}`
}

export function splitRunnerCommand(runner: string): { command: string, args: string[] } {
  const normalizedRunner = runner.trim().replaceAll(RUNNER_WHITESPACE_RE, ' ')
  if (!allowedRunnerCommands.has(normalizedRunner)) {
    throw new Error(`Unsupported package manager runner: "${runner}"`)
  }

  const parts = normalizedRunner.split(' ').map(part => part.trim()).filter(Boolean)
  const [command = runner, ...args] = parts
  return { command, args }
}
