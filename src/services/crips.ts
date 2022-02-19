import { CapacitorCrispWeb } from './crisp-web'

const CapacitorCrisp = new CapacitorCrispWeb()

export const setUserId = (uuid: string): void => {
  CapacitorCrisp.setString({ key: 'user-uuid', value: uuid })
}
export const setVersion = (version: string): void => {
  CapacitorCrisp.setString({ key: 'webVersion', value: version })
}
export const setDeviceInfo = (
  model: string,
  platform: string,
  operatingSystem: string,
  osVersion: string,
  webVersion: string,
  manufacturer: string,
): void => {
  CapacitorCrisp.setString({ key: 'model', value: model })
  CapacitorCrisp.setString({ key: 'platform', value: platform })
  CapacitorCrisp.setString({ key: 'operatingSystem', value: operatingSystem })
  CapacitorCrisp.setString({ key: 'osVersion', value: osVersion })
  CapacitorCrisp.setString({ key: 'nativeVersion', value: webVersion })
  CapacitorCrisp.setString({ key: 'manufacturer', value: manufacturer })
}
export const setPaidPlan = (planId: string): void => {
  CapacitorCrisp.setString({ key: 'paid-plan', value: planId })
}
export const sendMessage = (value: string): void => {
  CapacitorCrisp.sendMessage({ value })
}
export const openChat = (): void => {
  CapacitorCrisp.openMessenger()
}
export const initCrisp = (): void => {
  try {
    CapacitorCrisp.configure({
      websiteID: 'e7dbcfa4-91b1-4b74-b563-b9234aeb2eee',
    })
  }
  catch (e) {
    console.error('Crips cannot be init', e)
  }
}
