import { LogSnag } from 'logsnag'
import { isSpoofed } from './supabase'

export const useLogSnag = (): LogSnag => {
  if (isSpoofed()) {
    return {
      getProject: () => '',
      publish: () => Promise.resolve(false),
      insight: () => Promise.resolve(false),
    } as any as LogSnag
  }
  const logsnag = new LogSnag({
    token: import.meta.env.logsnag as string,
    project: 'capgo',
  })
  return logsnag
}
