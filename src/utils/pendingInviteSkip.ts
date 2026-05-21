const PENDING_INVITE_SKIP_STORAGE_KEY = 'capgo:pending-invite-skip-user'

function canUseSessionStorage() {
  return typeof sessionStorage !== 'undefined'
}

export function rememberPendingInviteSkip(userId: string | null | undefined) {
  if (!userId || !canUseSessionStorage())
    return

  sessionStorage.setItem(PENDING_INVITE_SKIP_STORAGE_KEY, userId)
}

export function hasPendingInviteSkip(userId: string | null | undefined) {
  if (!userId || !canUseSessionStorage())
    return false

  return sessionStorage.getItem(PENDING_INVITE_SKIP_STORAGE_KEY) === userId
}

export function clearPendingInviteSkip(userId: string | null | undefined) {
  if (!userId || !canUseSessionStorage())
    return

  if (sessionStorage.getItem(PENDING_INVITE_SKIP_STORAGE_KEY) === userId)
    sessionStorage.removeItem(PENDING_INVITE_SKIP_STORAGE_KEY)
}
