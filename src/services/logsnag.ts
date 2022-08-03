import { LogSnag } from 'logsnag'

export const useLogSnag = (): LogSnag => {
  const logsnag = new LogSnag({
    token: import.meta.env.logsnag as string,
    project: 'capgo',
  })
  return logsnag
}
