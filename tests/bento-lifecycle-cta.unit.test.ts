import type { AppEvidence, Product } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/evidence.ts'
import type { Candidate, LifecycleInput } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/types.ts'
import { describe, expect, it } from 'vitest'
import { buildLifecycleEvent } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/payload.ts'
import contract from '../docs/bento/lifecycle-v2-contract.json' with { type: 'json' }

const ORG = '22222222-2222-4222-8222-222222222222'
const NOW = '2026-10-19T12:00:00.000Z'
const WEBAPP = 'https://console.capgo.app'
const SETUP_BRANCHES = new Set(['progress_digest', 'stall_24h', 'help_48h', 'final_recovery_5d', 'resumed_progress_digest', 'no_app_recovery_24h', 'no_app_help_48h'])
const setupBranches = contract.branches.filter(branch => SETUP_BRANCHES.has(branch.key) || branch.key.endsWith('_unfinished'))

function input(product: Product, appPresent = true): LifecycleInput {
  const evidence: AppEvidence = {
    appId: 'com.example.current',
    incarnation: '11111111-1111-4111-8111-111111111111',
    createdAt: NOW,
    name: 'Current <app> & team',
    product,
    platform: product === 'builder' ? 'ios' : null,
    selected: true,
    healthy: true,
    activeUntil: null,
    facts: [],
    tasks: product === 'ota' ? { run_device: 'pending' } : { successful_cloud_build: 'pending' },
    checklistComplete: false,
    firstValue: null,
    fundingBlocked: false,
  }
  return {
    now: NOW,
    orgId: ORG,
    orgName: 'Example organization',
    product,
    recipientId: '33333333-3333-4333-8333-333333333333',
    email: 'lifecycle@example.com',
    creatorTreatment: true,
    consent: true,
    selected: true,
    shippingIntent: true,
    supportHold: false,
    paused: false,
    evidence: appPresent ? evidence : null,
    sourceHealthy: true,
    state: { enrolledAt: NOW, lastProgressAt: NOW, appLessSince: appPresent ? null : NOW, checklistCompleteAt: null, firstValueAt: null, batch: null },
    accepted: [],
    trialDeadline: '2026-10-27T12:00:00.000Z',
    billingHealthy: true,
    paid: false,
    compatibleCredits: false,
    plan: { name: 'Example plan', monthlyPrice: 19, reason: 'Fits current usage', includes: 'Updates and builds' },
  }
}

function payload(current: LifecycleInput, branch: string) {
  const candidate: Candidate = { branch, purpose: 'test-purpose', context: 'current', priority: 80, expiresAt: '2026-10-20T12:00:00.000Z' }
  return buildLifecycleEvent(current, candidate, 'stable-dispatch', WEBAPP).data
}

describe('approved lifecycle setup CTA contract', () => {
  it('changes exactly the 28 setup/recovery/unfinished Trial branches and requires the destination hint', () => {
    expect(setupBranches).toHaveLength(28)
    expect(contract.version).toBe('new-emails-v2-2026-10-19')
    expect(contract.required_string_fields).toContain('cta_destination_hint')
  })

  it.concurrent.each(setupBranches)('opens current setup for $product/$key while retaining concrete task instructions', (branch) => {
    const current = input(branch.product as Product, !branch.key.startsWith('no_app_'))
    const data = payload(current, branch.key)
    const link = new URL(String(data.continue_url))
    expect(link.origin).toBe(WEBAPP)
    expect(link.searchParams.get('oid')).toBe(ORG)
    expect(link.searchParams.get('source')).toBe('capgo_lifecycle')
    expect(link.searchParams.get('showChecklist')).not.toBe('1')
    expect(data.ai_setup_url).toBe(data.continue_url)
    if (current.evidence) {
      expect(data.cta_label).toBe('Continue setup in Capgo')
      expect(link.pathname).toBe('/app/com.example.current/getting-started')
      expect(link.searchParams.get('lifecycleSetup')).toBe('1')
      expect(data.cta_destination_hint).toBe('Opens the setup checklist for Current <app> & team in Capgo.')
      expect(data.next_action_explanation).toContain(branch.product === 'ota' ? 'Run your app' : 'Start your cloud build')
    }
    else {
      expect(data.cta_label).toBe('Choose my app in Capgo')
      expect(link.pathname).toBe(branch.product === 'ota' ? '/app/new' : '/apps')
      expect(data.cta_destination_hint).toBe('Opens Capgo so you can choose the app you want to set up.')
      expect(data.app_name).toBe('')
    }
  })

  it.concurrent.each(contract.branches.filter(branch => branch.key.endsWith('_unfinished')))('uses current app-less context for $product/$key rather than a frozen app destination', (branch) => {
    const data = payload(input(branch.product as Product, false), branch.key)
    expect(data.cta_label).toBe('Choose my app in Capgo')
    expect(data.cta_destination_hint).toBe('Opens Capgo so you can choose the app you want to set up.')
    expect(data.app_id).toBe('')
    expect(String(data.continue_url)).not.toContain('com.example.current')
  })

  it.concurrent.each(contract.branches.filter(branch => !setupBranches.includes(branch)))('preserves purpose-specific primary routing for $product/$key', (branch) => {
    const data = payload(input(branch.product as Product), branch.key)
    const funding = branch.key === 'funding_blocked'
    expect(data.cta_label).toBe(funding ? 'Review build allowance' : 'Choose Example plan')
    expect(new URL(String(data.continue_url)).pathname).toBe(funding ? '/settings/organization/credits' : '/settings/organization/plans')
    expect(data.cta_destination_hint).toBe('')
  })

  it.concurrent('uses the same current app fallback name in the payload and destination hint', () => {
    const current = input('ota')
    current.evidence!.name = '  '
    const data = payload(current, 'stall_24h')
    expect(data.app_name).toBe('com.example.current')
    expect(data.cta_destination_hint).toBe('Opens the setup checklist for com.example.current in Capgo.')
  })
})
