import type { Router } from 'vue-router'
import { toast } from 'vue-sonner'
import { isSpoofed, saveSpoof, unspoofUser, useSupabase } from './supabase'

function getErrorMessage(error: unknown) {
  if (error instanceof Error)
    return error.message
  if (typeof error === 'string')
    return error
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string')
    return (error as any).message as string
  return 'Cannot log in, see console'
}

export async function logAsUser(userId: string, router: Router) {
  const toastId = toast.loading('Logging as...')
  try {
    if (!userId)
      throw new Error('Missing user id')

    if (isSpoofed())
      unspoofUser()

    const supabase = useSupabase()
    const { data, error } = await supabase.functions.invoke('private/log_as', {
      body: { user_id: userId },
    })

    if (error)
      throw new Error(getErrorMessage(error))

    const { jwt: newJwt, refreshToken: newRefreshToken } = data ?? {}

    if (!newJwt || !newRefreshToken)
      throw new Error('Cannot log in, see console')

    const { data: currentSession, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !currentSession?.session)
      throw new Error('No current session')

    const { access_token: currentJwt, refresh_token: currentRefreshToken } = currentSession.session

    const { error: authError } = await supabase.auth.setSession({ access_token: newJwt, refresh_token: newRefreshToken })
    if (authError)
      throw authError

    saveSpoof(currentJwt, currentRefreshToken)
    toast.dismiss(toastId)
    toast.success('Spoofed, will reload')
    setTimeout(() => {
      router.replace('/dashboard').then(() => {
        window.location.reload()
      })
    }, 1000)
  }
  catch (error) {
    toast.dismiss(toastId)
    const message = getErrorMessage(error)
    toast.error(message)
    console.error(error)
    throw error
  }
}
