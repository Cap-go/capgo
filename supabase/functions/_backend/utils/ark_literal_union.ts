import { type } from 'arktype'

export function literalUnion<const T extends readonly string[]>(values: T) {
  return type(values.map(value => JSON.stringify(value)).join(' | ') as any) as any
}
