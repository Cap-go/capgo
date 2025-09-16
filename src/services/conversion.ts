export function toFixed(value: number, fixed: number) {
  if (fixed === 0)
    return value
  return Number.parseFloat(value.toFixed(fixed))
}
export function bytesToMb(bytes: number, fixes = 0) {
  return toFixed(Math.round(((bytes / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100, fixes)
}
export function bytesToGb(bytes: number, fixes = 0) {
  return toFixed(Math.round(((bytes / 1024.0 / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100, fixes)
}
export function octetsToGb(octets: number) {
  return Math.round(((octets / 8.0 / 1024.0 / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100
}
export function mbToBytes(mb: number) {
  return mb * 1024 * 1024
}
export function gbToBytes(gb: number) {
  return gb * 1024 * 1024 * 1024
}

export function bytesToMbText(bytes: number) {
  return `${bytesToMb(bytes)} MB`
}
export function bytesToGBText(bytes: number) {
  return `${bytesToGb(bytes)} GB`
}

export function urlToAppId(appId: string) {
  return appId.replace(/--/g, '.')
}
export function appIdToUrl(appId: string) {
  // return appId.replace(/\./g, '--') not needed anymore
  return appId
}
export function getDaysBetweenDates(date1: string | Date, date2: string | Date) {
  const oneDay = 24 * 60 * 60 * 1000
  const firstDate = new Date(date1)
  const secondDate = new Date(date2)
  const res = Math.round(Math.abs((firstDate.valueOf() - secondDate.valueOf()) / oneDay))
  return res
}
