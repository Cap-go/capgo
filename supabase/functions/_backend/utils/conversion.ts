export function bytesToMb(bytes: number) {
  return Math.round(((bytes / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100
}
export function bytesToGb(bytes: number) {
  return Math.round(((bytes / 1024.0 / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100
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
  return appId.replace(/\./g, '--')
}
