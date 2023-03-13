export const bytesToMb = (bytes: number) => (Math.round(((bytes / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100)
export const bytesToGb = (bytes: number) => (Math.round(((bytes / 1024.0 / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100)
export const mbToBytes = (mb: number) => mb * 1024 * 1024
export const gbToBytes = (gb: number) => gb * 1024 * 1024 * 1024

export const bytesToMbText = (bytes: number) => `${bytesToMb(bytes)} MB`
export const bytesToGBText = (bytes: number) => `${bytesToGb(bytes)} GB`

export const urlToAppId = (appId: string) => appId.replace(/--/g, '.')
export const appIdToUrl = (appId: string) => appId.replace(/\./g, '--')
