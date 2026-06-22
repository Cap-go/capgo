// cli/src/support/support-upload-prompt.ts
//
// The ADDITIVE "also upload your logs to Capgo support?" gate.
//
// Background: on a failed Builder build the user is offered AI analysis. That
// used to be mutually exclusive with emailing support — pick one. The product
// owner wants them additive: when a user opts into AI help we ALSO offer to
// upload their logs so the support team can follow up by email. This gate is
// UPLOAD-ONLY — unlike contactSupport() it never composes a mailto and never
// asks the user to send anything; we just push the bundle to Capgo and tell
// them support will reach out.
//
// It's a tiny pure orchestrator (deps injected) so both surfaces share one
// tested code path: the post-onboarding clack menu (build/request.ts) and the
// onboarding Ink flow (build/onboarding/**). Every step is best-effort: a
// declined gate, a failed bundle, or a failed upload must NEVER throw or block
// the AI analysis that follows.

// The yes/no prompt shown before AI analysis. Leans to "No" at the call site
// (default highlighted choice) so we never surprise-upload a user's logs.
export const SUPPORT_UPLOAD_PROMPT
  = 'Also upload these logs to Capgo support so our team can help? They\'ll follow up by email.'

// What we print after a successful upload. A function (not a const) to mirror
// the rest of the support module's message helpers and leave room for future
// per-context wording without breaking callers/tests.
export function supportUploadConfirmation(url?: string): string {
  const base = 'Logs uploaded — Capgo support will be in touch by email.'
  return url ? `${base}\nReference: ${url}` : base
}

export type SupportUploadOutcome
  // user said no (or the prompt itself failed/cancelled) — nothing was sent
  = | 'declined'
  // bundle uploaded to Capgo support; they'll follow up by email
    | 'uploaded'
  // user said yes but the upload couldn't complete (offline / null / threw)
    | 'unavailable'
  // user said yes but we couldn't even build the local bundle to send
    | 'failed'

export interface OfferSupportUploadDeps {
  // Show the additive yes/no gate; resolve true to upload, false/throw to skip.
  confirm: (message: string) => Promise<boolean>
  // Write the support bundle and return the gzipped path (or null on failure).
  // May be async so the UI can show a "Preparing your logs…" spinner.
  buildFiles: () => ({ gzPath: string } | null) | Promise<{ gzPath: string } | null>
  // Upload the gzipped bundle; resolve the public link, or null on any failure.
  upload: (gzPath: string) => Promise<{ id: string, url: string } | null>
  // Emit a user-facing line.
  print: (message: string) => void
}

// Ask the additive gate and, on yes, build + upload the support bundle. Returns
// an outcome the caller can feed to telemetry. NEVER throws — the AI analysis
// that runs next must always proceed regardless of what happens here.
export async function offerSupportUploadBeforeAi(deps: OfferSupportUploadDeps): Promise<SupportUploadOutcome> {
  let wants = false
  try {
    wants = await deps.confirm(SUPPORT_UPLOAD_PROMPT)
  }
  catch {
    // A torn-down TTY / cancelled prompt is a "no", not a crash.
    return 'declined'
  }
  if (!wants)
    return 'declined'

  let files: { gzPath: string } | null
  try {
    files = await deps.buildFiles()
  }
  catch {
    files = null
  }
  if (!files) {
    deps.print('Couldn\'t prepare your logs to send to Capgo support. You can email support@capgo.app and we\'ll help.')
    return 'failed'
  }

  let uploaded: { id: string, url: string } | null = null
  try {
    uploaded = await deps.upload(files.gzPath)
  }
  catch {
    uploaded = null
  }
  if (!uploaded) {
    deps.print('Logs upload to Capgo support is unavailable right now — continuing with AI analysis. You can email support@capgo.app if you need a hand.')
    return 'unavailable'
  }

  deps.print(supportUploadConfirmation(uploaded.url))
  return 'uploaded'
}
