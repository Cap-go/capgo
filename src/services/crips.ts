import { Capacitor } from '@capacitor/core'
import { isSpoofed } from './supabase'
import type { eventColor } from './crisp-web'
import { CapacitorCrispWeb } from './crisp-web'

const CapacitorCrisp = new CapacitorCrispWeb()
if (!Capacitor.isNativePlatform())
  CapacitorCrisp.isIframe = false
CapacitorCrisp.init()

export const pushEvent = (data: { name: string; color: eventColor }): void => {
  // 1cc91d4f-4421-4b8c-b46f-9963030d8108
  if (isSpoofed())
    return
  CapacitorCrisp.pushEvent(data)
}

export const setUserId = (uuid: string): void => {
  if (isSpoofed())
    return
  CapacitorCrisp.setString({ key: 'id', value: uuid })
}

export const setUser = (data: {
  nickname?: string
  phone?: string
  email?: string
  avatar?: string
}): void => {
  // console.log('setUser CapacitorCrisp')
  if (isSpoofed())
    return
  CapacitorCrisp.setUser(data)
}
export const setVersion = (version: string): void => {
  if (isSpoofed())
    return
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
  if (isSpoofed())
    return
  CapacitorCrisp.setString({ key: 'model', value: model })
  CapacitorCrisp.setString({ key: 'platform', value: platform })
  CapacitorCrisp.setString({ key: 'operatingSystem', value: operatingSystem })
  CapacitorCrisp.setString({ key: 'osVersion', value: osVersion })
  CapacitorCrisp.setString({ key: 'nativeVersion', value: webVersion })
  CapacitorCrisp.setString({ key: 'manufacturer', value: manufacturer })
}
export const setPaidPlan = (planId: string): void => {
  if (isSpoofed())
    return
  CapacitorCrisp.setString({ key: 'paid-plan', value: planId })
}
export const sendMessage = (value: string): void => {
  if (isSpoofed())
    return
  CapacitorCrisp.sendMessage({ value })
}
export const openChat = (): void => {
  if (isSpoofed())
    return
  CapacitorCrisp.openMessenger()
}
export const reset = (): void => {
  if (isSpoofed())
    return
  CapacitorCrisp.reset()
}
export const initCrisp = async (): Promise<void> => {
  if (isSpoofed())
    return
  try {
    await CapacitorCrisp.configure({
      websiteID: import.meta.env.crisp as string,
    })
  }
  catch (e) {
    console.error('Crips cannot be init', e)
  }
}
