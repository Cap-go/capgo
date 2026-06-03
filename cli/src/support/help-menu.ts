// cli/src/support/help-menu.ts
export interface HelpMenuOption {
  label: string
  value: string
}

export function buildHelpMenuOptions(opts: { hasBuildLog: boolean }): HelpMenuOption[] {
  const options: HelpMenuOption[] = [
    { label: '📨  Email Capgo support', value: 'support' },
  ]
  if (opts.hasBuildLog)
    options.push({ label: '🤖  Ask AI for help', value: 'ai' })
  options.push({ label: '🔄  Try again', value: 'retry' })
  options.push({ label: '❌  Exit', value: 'exit' })
  return options
}
