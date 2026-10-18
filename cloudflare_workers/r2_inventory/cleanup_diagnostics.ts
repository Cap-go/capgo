type FailureStage = 'inspection' | 'completion' | 'batch'
const errorTypes = new Set(['Error', 'TypeError', 'RangeError', 'AbortError', 'TimeoutError', 'AggregateError', 'DatabaseError'])
const sqlStates = new Set(['08000', '08001', '08003', '08004', '08006', '08007', '08P01', '53300', '53400', '55P03', '57014', '57P01', '57P02', '57P03', '42501', '40001', '40P01', '42P01', '42703', '25P02'])
const networkCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'])

// Raw errors can contain SQL parameters, object keys or connection strings.
// Only fixed classifications and explicitly allowlisted codes leave this helper.
export function cleanupFailureDiagnostic(error: unknown, stage: FailureStage) {
  let result: { stage: FailureStage, reason: string, errorType: string, sqlState?: string, networkCode?: string } = { stage, reason: 'other', errorType: 'OtherError' }
  for (let depth = 0; depth < 3 && error && typeof error === 'object'; depth++) {
    const value = error as { name?: unknown, message?: unknown, code?: unknown, cause?: unknown }
    const name = typeof value.name === 'string' ? value.name : ''
    const code = typeof value.code === 'string' ? value.code : ''
    const message = typeof value.message === 'string' ? value.message : ''
    const sqlState = sqlStates.has(code) ? code : undefined
    const networkCode = networkCodes.has(code) ? code : undefined
    const errorType = name === 'error' ? 'DatabaseError' : errorTypes.has(name) ? name : 'OtherError'
    const reason = message === 'Manifest replication evidence unavailable'
      ? 'replication_evidence_unavailable'
      : message === 'Inventory database binding missing'
        ? 'binding_missing'
        : message === 'Cleanup queue batch exceeds bound'
          ? 'batch_bound_exceeded'
          : code === '53300'
            ? 'connection_capacity'
            : code === '55P03'
              ? 'lock_timeout'
              : code === '57014'
                ? 'statement_timeout'
                : /failed to acquire a connection from the pool/i.test(message)
                  ? 'pool_exhausted'
                  : /timeout expired|connection.*timed? ?out/i.test(message)
                    ? 'connection_timeout'
                    : /query read timeout/i.test(message)
                      ? 'query_timeout'
                      : networkCode || sqlState?.startsWith('08')
                        ? 'connection_error'
                        : sqlState ? 'database_error' : 'other'
    result = { stage, reason, errorType, ...(sqlState && { sqlState }), ...(networkCode && { networkCode }) }
    if (reason !== 'other')
      return result
    error = value.cause
  }
  return result
}
