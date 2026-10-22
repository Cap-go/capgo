import type { Page } from '@playwright/test'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseWorktreeConfig } from '../../scripts/supabase-worktree-config'
import { getSupabaseStatus } from '../../scripts/supabase-worktree-status'
import { expect, test } from '../support/commands'

const { ports: supabasePorts } = getSupabaseWorktreeConfig()
const localSupabaseUrl = `http://127.0.0.1:${supabasePorts.api}`

function localAdminClient() {
  const configured = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  const status = configured ? null : getSupabaseStatus()
  const key = configured || status?.SERVICE_ROLE_KEY || status?.SECRET_KEY
  if (!key)
    throw new Error('Local Supabase service key is required for AI onboarding fixtures')
  return createClient(localSupabaseUrl, key, { auth: { persistSession: false } })
}

async function registerAndName(page: Page, email: string) {
  await page.goto('/register/')
  await page.fill('[data-test="email"]', email)
  await page.fill('[data-test="password"]', 'Password123!')
  await page.click('[data-test="submit"]')
  await page.waitForURL(/\/onboarding\/name/)
  const welcome = page.locator('[data-test="onboarding-welcome-continue"]')
  const name = page.locator('[data-test="onboarding-name-step"]')
  await expect(welcome.or(name)).toBeVisible()
  if (await welcome.isVisible())
    await welcome.click()
  await page.fill('[data-test="onboarding-first-name"]', 'Example')
  await page.fill('[data-test="onboarding-last-name"]', 'User')
  await page.click('[data-test="onboarding-name-continue"]')
  await page.waitForURL(/\/onboarding\/app/)
  await expect(page.locator('[data-test="onboarding-setup-mode"]')).toBeVisible()
}

test.describe('AI onboarding', () => {
  test('creates the organization with the chosen plan and waits for the agent to register the app', async ({ page }) => {
    const email = `ai-onboarding-${Date.now()}@example.com`
    await registerAndName(page, email)

    await page.click('[data-test="onboarding-setup-mode-ai"]')
    const create = page.locator('[data-test="onboarding-ai-create-org"]')
    await expect(create).toBeDisabled()
    await expect(page.locator('[data-test="onboarding-ai-org-name"]')).toHaveValue('Example\'s organization')

    // A refresh keeps the user on the AI path.
    await page.reload()
    await expect(page.locator('[data-test="onboarding-ai-plan"]')).toBeVisible()

    await page.locator('[data-test="onboarding-ai-plan-option"]').nth(1).click()
    const orgRequest = page.waitForRequest(request => request.method() === 'POST' && /\/organization(?:\?|$)/.test(request.url()))
    await create.click()
    const body = (await orgRequest).postDataJSON()
    expect(body).toMatchObject({ name: 'Example\'s organization', developmentEnvironment: 'ai_assistant', startingOut: false })
    expect(body.estimatedMau).toBeGreaterThan(0)

    await page.waitForURL(/\/onboarding\/ai$/)
    const prompt = page.locator('[data-test="onboarding-ai-prompt"]')
    await expect(prompt).toContainText('npx install-mcp \'npx @capgo/cli@latest mcp\'')
    await expect(prompt).toContainText('start_capgo_live_update_onboarding')
    // The preview never shows the secret.
    await expect(prompt).toContainText('login capgo_••••')
    await expect(page.locator('[data-test="onboarding-ai-copy-prompt"]')).toBeEnabled()
    await expect(page.locator('[data-test="onboarding-ai-waiting"]')).toBeVisible()

    // Leaving before the agent registers the app brings the user back to the prompt.
    await page.goto('/dashboard')
    await page.waitForURL(/\/onboarding\/ai$/)

    const admin = localAdminClient()
    const { data: user } = await admin.from('users').select('id, onboarding').eq('email', email).single()

    // What /private/events records when the agent's CLI logs in and its MCP starts.
    const task = (n: number) => page.locator(`[data-test="onboarding-ai-task-${n}"]`)
    await expect(task(1)).toHaveAttribute('data-done', 'false')
    await admin.from('users').update({ onboarding: { ...(user!.onboarding as object), ai_agent_connected_at: new Date().toISOString() } }).eq('id', user!.id)
    await expect(task(1)).toHaveAttribute('data-done', 'true', { timeout: 15000 })
    await expect(task(2)).toHaveAttribute('data-done', 'false')
    await admin.from('users').update({ onboarding: { ...(user!.onboarding as object), ai_agent_connected_at: new Date().toISOString(), ai_mcp_connected_at: new Date().toISOString() } }).eq('id', user!.id)
    await expect(task(2)).toHaveAttribute('data-done', 'true', { timeout: 15000 })

    // What the MCP does next: register the app in the new organization.
    const { data: org } = await admin.from('orgs').select('id').eq('created_by', user!.id).single()
    const appId = `com.example.ai${Date.now()}`
    const { error } = await admin.from('apps').insert({ app_id: appId, name: 'Agent App', owner_org: org!.id, icon_url: '' })
    expect(error).toBeNull()

    await expect(page.locator('[data-test="onboarding-ai-app-detected"]')).toContainText('Agent App', { timeout: 15000 })
    // No click: the page opens Getting started by itself, where the agent's progress shows live.
    await page.waitForURL(new RegExp(`/app/${appId.replaceAll('.', '\\.')}/getting-started$`))
  })

  test('keeps the manual wizard one click away', async ({ page }) => {
    await registerAndName(page, `ai-manual-${Date.now()}@example.com`)
    await page.click('[data-test="onboarding-setup-mode-manual"]')
    await expect(page.locator('[data-test="onboarding-intent-ota"]')).toBeVisible()
    await page.reload()
    // The manual wizard may offer its own resume dialog; the setup choice never comes back.
    const resume = page.locator('[data-test="onboarding-resume-continue"]')
    const goal = page.locator('[data-test="onboarding-intent-ota"]')
    await expect(resume.or(goal)).toBeVisible()
    if (await resume.isVisible())
      await resume.click()
    await expect(goal).toBeVisible()
    await expect(page.locator('[data-test="onboarding-setup-mode"]')).toHaveCount(0)
  })
})
