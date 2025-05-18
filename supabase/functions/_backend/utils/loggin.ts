import { getRuntimeKey } from 'hono/adapter'

export function cloudlog(message: any) {
  if (getRuntimeKey() === 'workerd') {
    console.log(message)
  }
  else {
    console.log(...message)
  }
}
