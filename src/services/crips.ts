import { Capacitor } from '@capacitor/core'
import { isSpoofed } from './supabase'
import type { eventColor } from './crisp-web'
import { CapacitorCrispWeb } from './crisp-web'

const CapacitorCrisp = new CapacitorCrispWeb()
if (!Capacitor.isNativePlatform())
  CapacitorCrisp.isIframe = false
CapacitorCrisp.init()

export function pushEvent(data: { name: string; color: eventColor }): void {
  // 1cc91d4f-4421-4b8c-b46f-9963030d8108
  if (isSpoofed())
    return
  CapacitorCrisp.pushEvent(data)
}

export function setUserId(uuid: string): void {
  if (isSpoofed())
    return
  CapacitorCrisp.setString({ key: 'id', value: uuid })
}

export function setUser(data: {
  nickname?: string
  phone?: string
  email?: string
  avatar?: string
}): void {
  // console.log('setUser CapacitorCrisp')
  if (isSpoofed())
    return
  CapacitorCrisp.setUser(data)
}
export function setVersion(version: string): void {
  if (isSpoofed())
    return
  CapacitorCrisp.setString({ key: 'webVersion', value: version })
}
export function setDeviceInfo(model: string,
  platform: string,
  operatingSystem: string,
  osVersion: string,
  webVersion: string,
  manufacturer: string): void {
  if (isSpoofed())
    return
  CapacitorCrisp.setString({ key: 'model', value: model })
  CapacitorCrisp.setString({ key: 'platform', value: platform })
  CapacitorCrisp.setString({ key: 'operatingSystem', value: operatingSystem })
  CapacitorCrisp.setString({ key: 'osVersion', value: osVersion })
  CapacitorCrisp.setString({ key: 'nativeVersion', value: webVersion })
  CapacitorCrisp.setString({ key: 'manufacturer', value: manufacturer })
}
export function setPaidPlan(planId: string): void {
  if (isSpoofed())
    return
  CapacitorCrisp.setString({ key: 'paid-plan', value: planId })
}
export function sendMessage(value: string): void {
  if (isSpoofed())
    return
  CapacitorCrisp.sendMessage({ value })
}
export function openChat(): void {
  if (isSpoofed())
    return
  CapacitorCrisp.openMessenger()
}
export function reset(): void {
  if (isSpoofed())
    return
  CapacitorCrisp.reset()
}
export async function initCrisp(): Promise<void> {
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
