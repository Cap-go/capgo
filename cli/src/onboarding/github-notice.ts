import { appendFileSync } from 'node:fs'
import process from 'node:process'
import { setupDebug } from './setup-diagnostics'

function escapeMarkdown(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/[\\`*_{}[\]()!#|]/g, '\\$&')
}

export function renderGitHubNotice(text: string): boolean {
  if (process.env.GITHUB_ACTIONS !== 'true')
    return false
  let noticeWritten = false
  try {
    const escaped = text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
    process.stdout.write(`::notice::${escaped}\n`)
    noticeWritten = true
    const summary = process.env.GITHUB_STEP_SUMMARY
    if (summary) {
      const markdown = text.trim().split('\n').map((line, index) => `${index === 0 ? '### ' : ''}${escapeMarkdown(line)}`).join('  \n')
      appendFileSync(summary, `\n${markdown}\n\n`, 'utf8')
    }
  }
  catch {
    // Optional reporting must never fail an otherwise successful deployment.
    setupDebug('GitHub notice output unavailable')
  }
  return noticeWritten
}
