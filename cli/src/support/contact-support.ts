// cli/src/support/contact-support.ts
import { buildMailtoUrl } from './mailto.js'

const SUPPORT_EMAIL = 'support@capgo.app'

// Tell the user everything that's about to happen — before anything happens.
function confirmMessage(hasUpload: boolean): string {
  if (hasUpload)
    return `We'll save your logs locally, upload a copy to Capgo support (kept 30 days), and open a pre-filled email to support@capgo.app in your mail app. Continue?`
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
  // Optional macOS Finder reveal; return true when the reveal actually happened.
  reveal?: (path: string) => boolean | void
  // Open a URL (the mailto:).
  openUrl: (url: string) => Promise<unknown>
  // Emit a user-facing line.
  print: (message: string) => void
  // Optional logs upload (R2-backed, 30-day lifecycle — see the support-logs
  // spec). Returns the public download link, or null on any failure; the flow
  // then degrades to the manual-attach path. Never blocks.
  upload?: (gzPath: string) => Promise<{ id: string, url: string } | null>
}

export type ContactSupportResult = 'opened' | 'cancelled' | 'failed'

// Re-entrancy guard: TUI selects can re-fire their onChange on re-render
// (@inkjs/ui gotcha), and a double invocation would open two mail windows.
let supportFlowInFlight = false

export async function contactSupport(deps: ContactSupportDeps): Promise<ContactSupportResult> {
  if (supportFlowInFlight)
    return 'cancelled'
  supportFlowInFlight = true
  try {
    return await runContactSupport(deps)
  }
  finally {
    supportFlowInFlight = false
  }
}

async function runContactSupport(deps: ContactSupportDeps): Promise<ContactSupportResult> {
  const proceed = await deps.confirm(confirmMessage(Boolean(deps.upload)))
  if (!proceed)
    return 'cancelled'

  const files = deps.buildFiles()
  if (!files) {
    deps.print('Could not save your logs locally. Please email support@capgo.app and describe the issue.')
    return 'failed'
  }

  // Preferred path: upload the gz and put the download link in the email body —
  // the mail is send-ready, there's nothing to attach (so no clipboard/Finder).
  const uploaded = deps.upload ? await deps.upload(files.gzPath) : null
  if (uploaded) {
    const body = `${deps.body}\n\nSupport logs (kept 30 days):\n${uploaded.url}`
    const url = buildMailtoUrl({ to: SUPPORT_EMAIL, subject: deps.subject, body })
    let mailOpened = true
    try {
      await deps.openUrl(url)
    }
    catch {
      mailOpened = false
    }
    if (mailOpened)
      deps.print(`Opened an email to ${SUPPORT_EMAIL} — it already links to your uploaded logs, just press Send. (Local copies: ${files.logPath})`)
    else
      deps.print(`Couldn't open your mail app automatically. Please email ${SUPPORT_EMAIL} and include this link to your uploaded logs: ${uploaded.url}`)
    return 'opened'
  }

  // Fallback (no uploader, upload failed, or offline): the manual attach flow.
  // Clipboard must hold the GZIPPED file path (the compact attachment).
  const copied = deps.copyPath(files.gzPath)
  const revealed = deps.reveal?.(files.gzPath) === true

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
  // The mail window launches on top of the Finder reveal — tell the user it's there.
  const finderNote = revealed ? ' A Finder window showing the file is open behind your mail app.' : ''
  if (mailOpened)
    deps.print(`Opened an email to ${SUPPORT_EMAIL}. Your logs are saved at ${files.gzPath}${clip} — attach that file and send.${finderNote} (A readable copy is also at ${files.logPath}.)`)
  else
    deps.print(`Couldn't open your mail app automatically. Please email ${SUPPORT_EMAIL} and attach your logs saved at ${files.gzPath}${clip}.${finderNote} (A readable copy is also at ${files.logPath}.)`)
  return 'opened'
}
