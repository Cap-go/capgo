// cli/src/support/contact-support.ts
import { rmSync } from 'node:fs'
import { buildMailtoUrl, MAILTO_BODY_MAX } from './mailto.js'

// Exported so headless surfaces (the MCP onboarding error recovery) can point
// users at the same address without duplicating it.
export const SUPPORT_EMAIL = 'support@capgo.app'

// Tell the user everything that's about to happen — before anything happens.
function confirmMessage(hasUpload: boolean): string {
  if (hasUpload)
    return `We'll upload your logs to Capgo support (kept 30 days) and open a pre-filled email to support@capgo.app in your mail app. Continue?`
  // Fallback: no upload, so we write a logs file the user attaches manually.
  const reveal = process.platform === 'darwin' ? ' and reveal it in Finder' : ''
  return `We'll save a logs file for you to attach${reveal}, then open a pre-filled email to support@capgo.app in your mail app. Continue?`
}

export interface ContactSupportDeps {
  subject: string
  body: string
  // Show the confirmation gate; resolve true to proceed, false to cancel. The
  // readable .log path is passed so the UI can offer a "View logs first" option
  // (inspect exactly what will be sent) before the user commits.
  confirm: (message: string, logPath: string) => Promise<boolean>
  // Write the bundle; return both paths, or null on failure. May be async so the UI
  // can show a "Preparing your logs…" spinner while a large bundle is gzipped/trimmed.
  buildFiles: () => ({ logPath: string, gzPath: string } | null) | Promise<{ logPath: string, gzPath: string } | null>
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

// buildMailtoUrl caps the body and truncates from the END — which is exactly
// where the logs link / attach path lives. Trim the free-text prefix instead,
// so the essential suffix ALWAYS survives.
function fitBodyPrefix(prefix: string, suffix: string): string {
  const budget = MAILTO_BODY_MAX - suffix.length
  if (prefix.length <= budget)
    return prefix
  const marker = '…(truncated)'
  return prefix.slice(0, Math.max(0, budget - marker.length)) + marker
}

// Re-entrancy guard: TUI selects can re-fire their onChange on re-render
// (@inkjs/ui gotcha), and a double invocation would open two mail windows.
let supportFlowInFlight = false

// Within ONE CLI run, upload the support logs only once. Repeated "Email support"
// (a double-click, or re-triggering after the mail window opened) then reuses the
// existing link instead of minting a second R2 object and burning the account's
// upload rate limit (1/min · 10/day). A fresh CLI invocation = new process =
// re-uploads.
let cachedUpload: { id: string, url: string } | null = null

// Test-only: reset the per-process upload cache so cases don't leak into each other.
export function resetSupportUploadCacheForTests(): void {
  cachedUpload = null
}

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
  // Write the bundle FIRST so the confirm step can offer "View logs first" —
  // the file is local-only; only the upload + email (below) are gated by consent.
  const files = await deps.buildFiles()
  if (!files) {
    deps.print('Could not save your logs locally. Please email support@capgo.app and describe the issue.')
    return 'failed'
  }

  const proceed = await deps.confirm(confirmMessage(Boolean(deps.upload)), files.logPath)
  if (!proceed)
    return 'cancelled'

  // Preferred path: upload the gz and put the download link in the email body —
  // the mail is send-ready, there's nothing to attach (so no clipboard/Finder).
  // Reuse this run's earlier successful upload instead of re-uploading (a second
  // upload would create a new link and eat the rate limit).
  let uploaded = deps.upload ? cachedUpload : null
  const reusedUpload = uploaded !== null
  if (deps.upload && !uploaded) {
    uploaded = await deps.upload(files.gzPath)
    if (uploaded)
      cachedUpload = uploaded
  }
  if (deps.upload && !uploaded)
    deps.print('(Logs upload to Capgo failed or is unavailable — the email will include attach instructions instead.)')
  if (uploaded) {
    const linkBlock = `\n\nSupport logs (kept 30 days):\n${uploaded.url}`
    const body = `${fitBodyPrefix(deps.body, linkBlock)}${linkBlock}`
    const url = buildMailtoUrl({ to: SUPPORT_EMAIL, subject: deps.subject, body })
    let mailOpened = true
    try {
      await deps.openUrl(url)
    }
    catch {
      mailOpened = false
    }
    // The logs now live in R2 (kept 30 days); the local copies are redundant on
    // the upload path — remove them so there's nothing to attach/open.
    try {
      rmSync(files.gzPath, { force: true })
      rmSync(files.logPath, { force: true })
    }
    catch { /* best-effort cleanup */ }

    if (mailOpened)
      deps.print(reusedUpload
        ? `Opened an email to ${SUPPORT_EMAIL} — reusing the logs you already uploaded this session (no new upload). Just press Send.`
        : `Opened an email to ${SUPPORT_EMAIL} — it links to your uploaded logs (kept 30 days). Just press Send.`)
    else
      deps.print(`Couldn't open your mail app automatically. Please email ${SUPPORT_EMAIL} and include this link to your uploaded logs:\n${uploaded.url}`)
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
  const attachBlock = `\n\nPlease attach the logs file saved at:\n${files.gzPath}${clipLine}`
  const body = `${fitBodyPrefix(deps.body, attachBlock)}${attachBlock}`
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
