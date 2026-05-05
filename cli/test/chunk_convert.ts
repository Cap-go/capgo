import { lorem } from './data'

const byteConvert = {
  'base64': (s: string) => (3 * (s.length / 4)) - ((s.match(/=/g) || []).length),
  'hex': (s: string) => s.length / 2,
  'binary': (s: string) => s.length / 10,
  'utf8': (s: string) => s.length,
}
const mbConvert = {
  'base64': (l: number) => (3 * (l / 4)),
  'hex': (l: number) => l / 2,
  'binary': (l: number) => l / 10,
  'utf8': (l: number) => l,
}
const oneMb = 1048576;

const buff = Buffer.from(lorem)
const b64 = buff.toString('base64')
const hex = buff.toString('hex')
const s = buff.toString('utf8')

const chuckNumber = (l: number, divider: number) => l < divider ? l : Math.round(l / divider)
const chuckSize = (l: number, divider: number) => Math.round(l / chuckNumber(l, divider))

console.log('buff', buff.length, buff.byteLength, chuckNumber(buff.length, oneMb), chuckSize(buff.length, oneMb))
console.log('b64', b64.length, byteConvert.base64(b64) / oneMb)
console.log('hex', hex.length, byteConvert.hex(hex) / oneMb)
console.log('string', s.length, byteConvert.utf8(s) / oneMb)