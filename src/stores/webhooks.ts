import type { Ref } from 'vue'
import type { Database } from '~/types/supabase.types'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from './organization'

export interface DeliveryPagination {
  page: number
  per_page: number
  total: number
  has_more: boolean
}

export interface TestResult {
  success: boolean
  status: number | null
  duration_ms: number | null
  response_preview: string | null
  delivery_id: string
  message: string
}

// Supported event types
export const WEBHOOK_EVENT_TYPES = [
  { value: 'apps', label: 'App Changes', description: 'When apps are created, updated, or deleted' },
  { value: 'app_versions', label: 'Bundle Changes', description: 'When bundles are created, updated, or deleted' },
  { value: 'channels', label: 'Channel Updates', description: 'When channels are modified' },
  { value: 'org_users', label: 'Member Changes', description: 'When members are added or removed' },
  { value: 'orgs', label: 'Organization Changes', description: 'When organization settings are updated' },
] as const

const DELIVERIES_PER_PAGE = 50

const supabase = useSupabase()

type WebhookRow = Database['public']['Tables']['webhooks']['Row']
type WebhookWriteData = Partial<{
  name: string
  url: string
  events: string[]
  enabled: boolean
}>

function getCurrentOrgId(): string | undefined {
  return useOrganizationStore().currentOrganization?.gid
}

function validateWebhookUrl(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url)
    const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname.endsWith('.localhost')
    const isLoopback = parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === '::1'
    if (parsedUrl.protocol !== 'https:' && !isLocalhost && !isLoopback) {
      return 'Webhook URL must use HTTPS'
    }
  }
  catch {
    return 'Invalid URL'
  }
}

function validateWebhookEvents(events: string[]): string | undefined {
  const validEvents = WEBHOOK_EVENT_TYPES.map(e => e.value)
  const invalidEvents = events.filter(e => !validEvents.includes(e as any))
  if (invalidEvents.length > 0) {
    return `Invalid event types: ${invalidEvents.join(', ')}`
  }
}

function validateWebhookData(webhookData: WebhookWriteData): string | undefined {
  if (webhookData.url) {
    const urlError = validateWebhookUrl(webhookData.url)
    if (urlError)
      return urlError
  }

  if (webhookData.events) {
    const eventsError = validateWebhookEvents(webhookData.events)
    if (eventsError)
      return eventsError
  }
}

async function invokeWebhookApi(
  method: 'POST' | 'PUT' | 'DELETE',
  body: Record<string, unknown>,
  failureMessage: string,
  exceptionMessage: string,
): Promise<{ data?: any, error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('webhooks', { method, body })
    return error ? { error: error.message || failureMessage } : { data }
  }
  catch (err: any) {
    return { error: err?.message || exceptionMessage }
  }
}

export const useWebhooksStore = defineStore('webhooks', () => {
  const webhooks: Ref<WebhookRow[]> = ref([])
  const deliveries: Ref<Database['public']['Tables']['webhook_deliveries']['Row'][]> = ref([])
  const deliveryPagination: Ref<DeliveryPagination | null> = ref(null)
  const isLoading = ref(false)
  const isLoadingDeliveries = ref(false)

  /**
   * Fetch all webhooks for the current organization
   * Uses direct Supabase SDK - RLS handles permissions
   */
  async function fetchWebhooks(): Promise<void> {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      console.error('No organization selected')
      return
    }

    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to fetch webhooks:', error)
        return
      }

      webhooks.value = data || []
    }
    catch (err) {
      console.error('Error fetching webhooks:', err)
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Get a single webhook
   * Uses direct Supabase SDK - RLS handles permissions
   */
  async function getWebhook(webhookId: string): Promise<WebhookRow | null> {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      console.error('No organization selected')
      return null
    }

    try {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('id', webhookId)
        .eq('org_id', orgId)
        .single()

      if (error) {
        console.error('Failed to fetch webhook:', error)
        return null
      }

      return data
    }
    catch (err) {
      console.error('Error fetching webhook:', err)
      return null
    }
  }

  /**
   * Create a new webhook
   * Uses the webhook API so backend permission checks stay centralized
   */
  async function createWebhook(webhookData: {
    name: string
    url: string
    events: string[]
  }): Promise<{ success: boolean, webhook?: WebhookRow, error?: string }> {
    const orgId = getCurrentOrgId()
    if (!orgId) {
      return { success: false, error: 'No organization selected' }
    }

    const validationError = validateWebhookData(webhookData)
    if (validationError)
      return { success: false, error: validationError }

    const result = await invokeWebhookApi('POST', { orgId, ...webhookData, enabled: true }, 'Failed to create webhook', 'Error creating webhook')
    if (result.error)
      return { success: false, error: result.error }

    const webhook = result.data?.webhook as WebhookRow | undefined
    if (webhook) {
      webhooks.value.unshift(webhook)
    }

    return { success: true, webhook }
  }

  /**
   * Update an existing webhook
   * Uses the webhook API so backend permission checks stay centralized
   */
  async function updateWebhook(
    webhookId: string,
    webhookData: WebhookWriteData,
  ): Promise<{ success: boolean, webhook?: WebhookRow, error?: string }> {
    const orgId = getCurrentOrgId()
    if (!orgId) {
      return { success: false, error: 'No organization selected' }
    }

    const validationError = validateWebhookData(webhookData)
    if (validationError)
      return { success: false, error: validationError }

    const result = await invokeWebhookApi('PUT', { orgId, webhookId, ...webhookData }, 'Failed to update webhook', 'Error updating webhook')
    if (result.error)
      return { success: false, error: result.error }

    const webhook = result.data?.webhook as WebhookRow | undefined
    if (webhook) {
      const index = webhooks.value.findIndex(w => w.id === webhookId)
      if (index !== -1) {
        webhooks.value[index] = webhook
      }
    }

    return { success: true, webhook }
  }

  /**
   * Delete a webhook
   * Uses the webhook API so backend permission checks stay centralized
   */
  async function deleteWebhook(webhookId: string): Promise<{ success: boolean, error?: string }> {
    const orgId = getCurrentOrgId()
    if (!orgId) {
      return { success: false, error: 'No organization selected' }
    }

    const result = await invokeWebhookApi('DELETE', { orgId, webhookId }, 'Failed to delete webhook', 'Error deleting webhook')
    if (result.error)
      return { success: false, error: result.error }

    webhooks.value = webhooks.value.filter(w => w.id !== webhookId)
    return { success: true }
  }

  /**
   * Test a webhook - requires edge function to make actual HTTP call
   */
  async function testWebhook(webhookId: string): Promise<TestResult> {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      return {
        success: false,
        status: null,
        duration_ms: null,
        response_preview: null,
        delivery_id: '',
        message: 'No organization selected',
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('webhooks/test', {
        method: 'POST',
        body: { orgId, webhookId },
      })

      if (error) {
        return {
          success: false,
          status: null,
          duration_ms: null,
          response_preview: null,
          delivery_id: '',
          message: error.message || 'Failed to test webhook',
        }
      }

      return data
    }
    catch (err: any) {
      return {
        success: false,
        status: null,
        duration_ms: null,
        response_preview: null,
        delivery_id: '',
        message: err?.message || 'Error testing webhook',
      }
    }
  }

  /**
   * Fetch deliveries for a webhook
   * Uses direct Supabase SDK - RLS handles permissions
   */
  async function fetchDeliveries(webhookId: string, page = 0, status?: string): Promise<void> {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      console.error('No organization selected')
      return
    }

    isLoadingDeliveries.value = true
    try {
      const from = page * DELIVERIES_PER_PAGE
      const to = (page + 1) * DELIVERIES_PER_PAGE - 1

      let query = supabase
        .from('webhook_deliveries')
        .select('*', { count: 'exact' })
        .eq('webhook_id', webhookId)
        .eq('org_id', orgId)

      if (status) {
        query = query.eq('status', status)
      }

      query = query.order('created_at', { ascending: false }).range(from, to)

      const { data, error, count } = await query

      if (error) {
        console.error('Failed to fetch deliveries:', error)
        return
      }

      deliveries.value = data || []
      deliveryPagination.value = {
        page,
        per_page: DELIVERIES_PER_PAGE,
        total: count ?? 0,
        has_more: (data?.length ?? 0) === DELIVERIES_PER_PAGE,
      }
    }
    catch (err) {
      console.error('Error fetching deliveries:', err)
    }
    finally {
      isLoadingDeliveries.value = false
    }
  }

  /**
   * Retry a failed delivery - requires edge function to queue the retry
   */
  async function retryDelivery(deliveryId: string): Promise<{ success: boolean, error?: string }> {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      return { success: false, error: 'No organization selected' }
    }

    try {
      const { error } = await supabase.functions.invoke('webhooks/deliveries/retry', {
        method: 'POST',
        body: { orgId, deliveryId },
      })

      if (error) {
        return { success: false, error: error.message || 'Failed to retry delivery' }
      }

      // Update local delivery status
      const index = deliveries.value.findIndex(d => d.id === deliveryId)
      if (index !== -1) {
        deliveries.value[index].status = 'pending'
        deliveries.value[index].attempt_count = 0
      }

      return { success: true }
    }
    catch (err: any) {
      return { success: false, error: err?.message || 'Error retrying delivery' }
    }
  }

  /**
   * Toggle webhook enabled state
   */
  async function toggleWebhook(webhookId: string): Promise<{ success: boolean, error?: string }> {
    const webhook = webhooks.value.find(w => w.id === webhookId)
    if (!webhook) {
      return { success: false, error: 'Webhook not found' }
    }

    return updateWebhook(webhookId, { enabled: !webhook.enabled })
  }

  /**
   * Clear store state
   */
  function reset(): void {
    webhooks.value = []
    deliveries.value = []
    deliveryPagination.value = null
    isLoading.value = false
    isLoadingDeliveries.value = false
  }

  return {
    // State
    webhooks,
    deliveries,
    deliveryPagination,
    isLoading,
    isLoadingDeliveries,

    // Actions
    fetchWebhooks,
    getWebhook,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
    fetchDeliveries,
    retryDelivery,
    toggleWebhook,
    reset,
  }
})
