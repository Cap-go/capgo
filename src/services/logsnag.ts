import { LogSnag } from 'logsnag'

export const useLogSnag = (): LogSnag => {
  if (localStorage.getItem('supabase.old_id')) {
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
