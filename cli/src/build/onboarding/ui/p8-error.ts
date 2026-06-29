/**
 * Pure classifier for the .p8 submit handlers' catch blocks (ui/app.tsx —
 * the api-key-instructions onPathSubmit and input-p8-path onSubmit handlers).
 *
 * Those handlers' try blocks span more than the readFile: savePartialProgress
 * and loadProgress run AFTER the read succeeded, so the catch must not rewrite
 * every failure to "File not found: <path>". Only a genuinely missing file
 * (ENOENT) earns the friendly not-found message; everything else (EACCES,
 * persistence I/O failures, programming errors, non-Error throwables) is
 * 'other' and the handler surfaces the REAL error instead.
 */
export type P8SubmitErrorKind = 'not-found' | 'other'

export function classifyP8SubmitError(err: unknown): P8SubmitErrorKind {
  if (
    typeof err === 'object'
    && err !== null
    && 'code' in err
    && (err as { code?: unknown }).code === 'ENOENT'
  ) {
    return 'not-found'
  }
  return 'other'
}
