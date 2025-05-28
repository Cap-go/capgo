import { getRuntimeKey } from 'hono/adapter'

export function cloudlog(message: any) {
  if (getRuntimeKey() === 'workerd') {
    console.log(message)
  }
  else {
    if (typeof message === 'object' && message !== null) {
      const entries = Object.entries(message)
      const logArgs = entries.flatMap(([key, value]) => [key, value])
      console.log(...logArgs)
    }
    else {
      console.log(message)
    }
  }
}
export function cloudlogErr(message: any) {
  if (getRuntimeKey() === 'workerd') {
    console.error(message)
  }
  else {
    if (typeof message === 'object' && message !== null) {
      const entries = Object.entries(message)
      const logArgs = entries.flatMap(([key, value]) => [key, value])
      console.error(...logArgs)
    }
    else {
      console.error(message)
    }
  }
}

