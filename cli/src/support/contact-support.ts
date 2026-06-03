// cli/src/support/contact-support.ts
import { buildMailtoUrl } from './mailto.js'

const SUPPORT_EMAIL = 'support@capgo.app'

// Tell the user everything that's about to happen — incl. the macOS Finder reveal.
function confirmMessage(): string {
  const reveal = process.platform === 'darwin' ? ', reveal them in Finder,' : ''
  return `We'll save your logs locally${reveal} and open a pre-filled email to support@capgo.app in your mail app. Continue?`
}

export interface ContactSupportDeps {
  subject: string
  body: string
  // Show the confirmation gate; resolve true to proceed, false to cancel.
  confirm: (message: string) => Promise<boolean>
  // Write the bundle; return both paths, or null on failure.
  buildFiles: () => { logPath: string, gzPath: string } | null
  // Copy a path to the clipboard; return success.
  copyPath: (path: string) => boolean
  // Optional macOS Finder reveal.
  reveal?: (path: string) => void
  // Open a URL (the mailto:).
  openUrl: (url: string) => Promise<unknown>
  // Emit a user-facing line.
  print: (message: string) => void
}

export type ContactSupportResult = 'opened' | 'cancelled' | 'failed'

export async function contactSupport(deps: ContactSupportDeps): Promise<ContactSupportResult> {
  const proceed = await deps.confirm(confirmMessage())
  if (!proceed)
    return 'cancelled'

  const files = deps.buildFiles()
  if (!files) {
    deps.print('Could not save your logs locally. Please email support@capgo.app and describe the issue.')
    return 'failed'
  }

  // Clipboard must hold the GZIPPED file path (the compact attachment).
  const copied = deps.copyPath(files.gzPath)
  deps.reveal?.(files.gzPath)

  // Put the saved file path in the email body too — mailto: can't auto-attach, and
  // the user is looking at their mail client now, not the terminal. Only claim it's
  // on the clipboard if the copy actually succeeded.
  const clipLine = copied ? '\n(The path is already on your clipboard.)' : ''
  const body = `${deps.body}\n\nPlease attach the logs file saved at:\n${files.gzPath}${clipLine}`
  const url = buildMailtoUrl({ to: SUPPORT_EMAIL, subject: deps.subject, body })

  let mailOpened = true
  try {
    await deps.openUrl(url)
  }
  catch {
    // Mail client failed to open — don't claim we opened it; the user still has the file.
    mailOpened = false
  }

  const clip = copied ? ' (copied to your clipboard)' : ''
  if (mailOpened)
    deps.print(`Opened an email to ${SUPPORT_EMAIL}. Your logs are saved at ${files.gzPath}${clip} — attach that file and send. (A readable copy is also at ${files.logPath}.)`)
  else
    deps.print(`Couldn't open your mail app automatically. Please email ${SUPPORT_EMAIL} and attach your logs saved at ${files.gzPath}${clip}. (A readable copy is also at ${files.logPath}.)`)
  return 'opened'
}
