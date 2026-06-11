import type {
  CompatibilityBundle,
  CurrentDefaultForPlatform,
  DecideCompatibilityEventsInput,
  PreviousDefault,
  UnresolvedCompatibilityEvent,
} from '../supabase/functions/_backend/triggers/compatibility_events.ts'
import type { NativePackage } from '../supabase/functions/_backend/utils/bundle_compatibility.ts'
import { describe, expect, it } from 'vitest'
import {
  decideAutoResolves,
  decideCompatibilityEvents,
} from '../supabase/functions/_backend/triggers/compatibility_events.ts'

// ---- fixtures -------------------------------------------------------------

const CHANGE_AT = '2026-06-06T12:00:00.000Z'
const PKG_V6: NativePackage[] = [{ name: '@capacitor/core', version: '6.0.0' }]
// Major bump → version ranges do not intersect → incompatible.
const PKG_V7: NativePackage[] = [{ name: '@capacitor/core', version: '7.0.0' }]
// Same native packages as v7 (a native-identical successor).
const PKG_V7_DUP: NativePackage[] = [{ name: '@capacitor/core', version: '7.0.0' }]

function bundle(id: number, name: string, nativePackages: NativePackage[] | null): CompatibilityBundle {
  return { id, name, nativePackages }
}

function newChannel(overrides: Partial<DecideCompatibilityEventsInput['newChannel']> = {}): DecideCompatibilityEventsInput['newChannel'] {
  return {
    id: 101,
    app_id: 'com.test.app',
    owner_org: 'org-1',
    name: 'production',
    version: 700,
    public: true,
    ios: true,
    android: false,
    electron: false,
    disable_auto_update: 'major',
    // The platform downgrade guard, on by default (mirrors the column default).
    disable_auto_update_under_native: true,
    ...overrides,
  }
}

describe('decideCompatibilityEvents', () => {
  it('emits an event for a same-channel incompatible version change (Case B)', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel(),
      currentBundle: bundle(700, '7.0.0', PKG_V7),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(600, '6.0.0', PKG_V6),
      }],
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      org_id: 'org-1',
      app_id: 'com.test.app',
      source: 'default_channel_version_changed',
      platform: 'ios',
      channel_id: 101,
      channel_name: 'production',
      current_version_id: 700,
      current_version_name: '7.0.0',
      previous_version_id: 600,
      previous_version_name: '6.0.0',
      offenders: ['@capacitor/core'],
    })
  })

  it('emits an event for a default-channel switch (Case A)', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel(),
      currentBundle: bundle(700, '7.0.0', PKG_V7),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_changed',
        bundle: bundle(600, '6.0.0', PKG_V6),
      }],
    })

    expect(events).toHaveLength(1)
    expect(events[0].source).toBe('default_channel_changed')
    expect(events[0].previous_version_id).toBe(600)
  })

  it('emits no event when the change is OTA-compatible', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel(),
      currentBundle: bundle(700, '6.0.1', PKG_V6),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(600, '6.0.0', PKG_V6),
      }],
    })

    expect(events).toHaveLength(0)
  })

  it('emits no event under the metadata (version_number) strategy', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel({ disable_auto_update: 'version_number' }),
      currentBundle: bundle(700, '7.0.0', PKG_V7),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(600, '6.0.0', PKG_V6),
      }],
    })

    expect(events).toHaveLength(0)
  })

  it('emits no event when the current bundle has no native_packages', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel(),
      currentBundle: bundle(700, '7.0.0', null),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(600, '6.0.0', PKG_V6),
      }],
    })

    expect(events).toHaveLength(0)
  })

  it('emits no event when the previous bundle has no native_packages', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel(),
      currentBundle: bundle(700, '7.0.0', PKG_V7),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(600, '6.0.0', []),
      }],
    })

    expect(events).toHaveLength(0)
  })

  it('does not drop a soft-deleted baseline (still has native_packages)', () => {
    // A soft-deleted previous bundle is still a valid baseline as long as its
    // metadata is present: we must still raise the event.
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel(),
      currentBundle: bundle(700, '7.0.0', PKG_V7),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(600, '6.0.0', PKG_V6),
      }],
    })

    expect(events).toHaveLength(1)
  })

  it('fans out one event per default platform (ios + android, not electron)', () => {
    const previous = (platform: PreviousDefault['platform']): PreviousDefault => ({
      platform,
      source: 'default_channel_version_changed',
      bundle: bundle(600, '6.0.0', PKG_V6),
    })

    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel({ ios: true, android: true, electron: false }),
      currentBundle: bundle(700, '7.0.0', PKG_V7),
      previousDefaults: [previous('ios'), previous('android'), previous('electron')],
    })

    const platforms = events.map(e => e.platform).sort()
    expect(platforms).toEqual(['android', 'ios'])
  })

  it('emits no event when the channel is not public', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel({ public: false }),
      currentBundle: bundle(700, '7.0.0', PKG_V7),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(600, '6.0.0', PKG_V6),
      }],
    })

    expect(events).toHaveLength(0)
  })

  it('emits no event when previous and current are the same bundle id', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel(),
      currentBundle: bundle(700, '7.0.0', PKG_V7),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(700, '7.0.0', PKG_V7),
      }],
    })

    expect(events).toHaveLength(0)
  })

  it('suppresses the mirror event when reverting to an unresolved event\'s baseline', () => {
    // E1 (prev=600, cur=700) is unresolved; the channel reverts 700 -> 600.
    // Without suppression this raises E2 (prev=700, cur=600) and every rollback
    // would raise the next mirror event, forever.
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel({ version: 600 }),
      currentBundle: bundle(600, '6.0.0', PKG_V6),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(700, '7.0.0', PKG_V7),
      }],
      unresolvedEvents: [{
        id: 1,
        platform: 'ios',
        channel_id: 101,
        previous_version_id: 600,
        previous_version_name: '6.0.0',
        current_version_id: 700,
      }],
    })

    expect(events).toHaveLength(0)
  })

  it('does NOT suppress the mirror event when the downgrade guard is off', () => {
    // With disable_auto_update_under_native off, devices that already installed
    // the newer native build CAN receive the rolled-back bundle, so the mirror
    // event is a real warning and must be raised.
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel({ version: 600, disable_auto_update_under_native: false }),
      currentBundle: bundle(600, '6.0.0', PKG_V6),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(700, '7.0.0', PKG_V7),
      }],
      unresolvedEvents: [{
        id: 1,
        platform: 'ios',
        channel_id: 101,
        previous_version_id: 600,
        previous_version_name: '6.0.0',
        current_version_id: 700,
      }],
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ previous_version_id: 700, current_version_id: 600 })
  })

  it('does NOT suppress when the unresolved baseline belongs to another channel', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel({ version: 600 }),
      currentBundle: bundle(600, '6.0.0', PKG_V6),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(700, '7.0.0', PKG_V7),
      }],
      unresolvedEvents: [{
        id: 1,
        platform: 'ios',
        channel_id: 999,
        previous_version_id: 600,
        previous_version_name: '6.0.0',
        current_version_id: 700,
      }],
    })

    expect(events).toHaveLength(1)
  })

  it('does NOT suppress an incompatible change to a bundle no unresolved event knows as a baseline', () => {
    const events = decideCompatibilityEvents({
      changeOccurredAt: CHANGE_AT,
      newChannel: newChannel({ version: 600 }),
      currentBundle: bundle(600, '6.0.0', PKG_V6),
      previousDefaults: [{
        platform: 'ios',
        source: 'default_channel_version_changed',
        bundle: bundle(700, '7.0.0', PKG_V7),
      }],
      unresolvedEvents: [{
        id: 1,
        platform: 'ios',
        channel_id: 101,
        previous_version_id: 500,
        previous_version_name: '5.0.0',
        current_version_id: 700,
      }],
    })

    expect(events).toHaveLength(1)
  })
})

describe('decideAutoResolves', () => {
  function unresolved(overrides: Partial<UnresolvedCompatibilityEvent> = {}): UnresolvedCompatibilityEvent {
    return {
      id: 1,
      platform: 'ios',
      channel_id: 101,
      previous_version_id: 600,
      previous_version_name: '6.0.0',
      current_version_id: 700,
      ...overrides,
    }
  }

  it('auto-resolves when the current default is now compatible with the baseline', () => {
    // Reverted to a v6-compatible default (id 800) — compatible with baseline 600.
    const currentDefault: CurrentDefaultForPlatform[] = [{ platform: 'ios', bundle: bundle(800, '6.0.1', PKG_V6) }]
    const bundles = new Map([[600, bundle(600, '6.0.0', PKG_V6)]])

    const resolves = decideAutoResolves([unresolved()], currentDefault, bundles)

    expect(resolves).toHaveLength(1)
    expect(resolves[0].id).toBe(1)
    expect(resolves[0].note).toContain('6.0.1')
    expect(resolves[0].note).toContain('6.0.0')
  })

  it('does NOT auto-resolve on a native-identical successor', () => {
    // The current default is the very same bundle that raised the event: users
    // are still stranded, so the event must stay open.
    const currentDefault: CurrentDefaultForPlatform[] = [{ platform: 'ios', bundle: bundle(700, '7.0.0', PKG_V7) }]
    const bundles = new Map([[600, bundle(600, '6.0.0', PKG_V6)]])

    const resolves = decideAutoResolves([unresolved({ current_version_id: 700 })], currentDefault, bundles)

    expect(resolves).toHaveLength(0)
  })

  it('does NOT auto-resolve a different-but-still-incompatible successor (id ≠ current, native re-uploaded)', () => {
    // A new bundle id (900) but native-identical to the incompatible v7: still
    // incompatible with the v6 baseline, so it must not clear the event.
    const currentDefault: CurrentDefaultForPlatform[] = [{ platform: 'ios', bundle: bundle(900, '7.0.1', PKG_V7_DUP) }]
    const bundles = new Map([[600, bundle(600, '6.0.0', PKG_V6)]])

    const resolves = decideAutoResolves([unresolved({ current_version_id: 700 })], currentDefault, bundles)

    expect(resolves).toHaveLength(0)
  })

  it('does NOT auto-resolve when the current default for the platform is unknown', () => {
    const resolves = decideAutoResolves([unresolved()], [], new Map([[600, bundle(600, '6.0.0', PKG_V6)]]))
    expect(resolves).toHaveLength(0)
  })
})
