import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from './organization'

export interface Webhook {
  id: string
  org_id: string
  name: string
  url: string
  enabled: boolean
  events: string[]
  created_at: string
  updated_at: string
  created_by: string | null
  stats_24h?: {
    success: number
    failed: number
    pending: number
  }
}

export interface WebhookDelivery {
  id: string
  webhook_id: string
  org_id: string
  audit_log_id: number | null
  event_type: string
  status: 'pending' | 'success' | 'failed'
  request_payload: any
  response_status: number | null
  response_body: string | null
  response_headers: Record<string, string> | null
  attempt_count: number
  max_attempts: number
  next_retry_at: string | null
  created_at: string
  completed_at: string | null
  duration_ms: number | null
}

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
  { value: 'app_versions', label: 'Bundle Changes', description: 'When bundles are created, updated, or deleted' },
  { value: 'channels', label: 'Channel Updates', description: 'When channels are modified' },
  { value: 'org_users', label: 'Member Changes', description: 'When members are added or removed' },
  { value: 'orgs', label: 'Organization Changes', description: 'When organization settings are updated' },
] as const

const supabase = useSupabase()

export const useWebhooksStore = defineStore('webhooks', () => {
  const webhooks: Ref<Webhook[]> = ref([])
  const deliveries: Ref<WebhookDelivery[]> = ref([])
  const deliveryPagination: Ref<DeliveryPagination | null> = ref(null)
  const isLoading = ref(false)
  const isLoadingDeliveries = ref(false)

  /**
   * Fetch all webhooks for the current organization
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
      const { data, error } = await supabase.functions.invoke('webhooks', {
        method: 'GET',
        body: { orgId },
      })

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
   * Get a single webhook with stats
   */
  async function getWebhook(webhookId: string): Promise<Webhook | null> {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      console.error('No organization selected')
      return null
    }

    try {
      const { data, error } = await supabase.functions.invoke('webhooks', {
        method: 'GET',
        body: { orgId, webhookId },
      })

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
   */
  async function createWebhook(webhookData: {
    name: string
    url: string
    events: string[]
    enabled?: boolean
  }): Promise<{ success: boolean, webhook?: Webhook, error?: string }> {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      return { success: false, error: 'No organization selected' }
    }

    try {
      const { data, error } = await supabase.functions.invoke('webhooks', {
        method: 'POST',
        body: {
          orgId,
          ...webhookData,
        },
      })

      if (error) {
        return { success: false, error: error.message || 'Failed to create webhook' }
      }

      // Add to local list
      if (data?.webhook) {
        webhooks.value.unshift(data.webhook)
      }

      return { success: true, webhook: data?.webhook }
    }
    catch (err: any) {
      return { success: false, error: err?.message || 'Error creating webhook' }
    }
  }

  /**
   * Update an existing webhook
   */
  async function updateWebhook(
    webhookId: string,
    webhookData: Partial<{
      name: string
      url: string
      events: string[]
      enabled: boolean
    }>,
  ): Promise<{ success: boolean, webhook?: Webhook, error?: string }> {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      return { success: false, error: 'No organization selected' }
    }

    try {
      const { data, error } = await supabase.functions.invoke('webhooks', {
        method: 'PUT',
        body: {
          orgId,
          webhookId,
          ...webhookData,
        },
      })

      if (error) {
        return { success: false, error: error.message || 'Failed to update webhook' }
      }

      // Update local list
      if (data?.webhook) {
        const index = webhooks.value.findIndex(w => w.id === webhookId)
        if (index !== -1) {
          webhooks.value[index] = data.webhook
        }
      }

      return { success: true, webhook: data?.webhook }
    }
    catch (err: any) {
      return { success: false, error: err?.message || 'Error updating webhook' }
    }
  }

  /**
   * Delete a webhook
   */
  async function deleteWebhook(webhookId: string): Promise<{ success: boolean, error?: string }> {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      return { success: false, error: 'No organization selected' }
    }

    try {
      const { error } = await supabase.functions.invoke('webhooks', {
        method: 'DELETE',
        body: { orgId, webhookId },
      })

      if (error) {
        return { success: false, error: error.message || 'Failed to delete webhook' }
      }

      // Remove from local list
      webhooks.value = webhooks.value.filter(w => w.id !== webhookId)

      return { success: true }
    }
    catch (err: any) {
      return { success: false, error: err?.message || 'Error deleting webhook' }
    }
  }

  /**
   * Test a webhook
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
      const body: any = { orgId, webhookId, page }
      if (status) {
        body.status = status
      }

      const { data, error } = await supabase.functions.invoke('webhooks/deliveries', {
        method: 'GET',
        body,
      })

      if (error) {
        console.error('Failed to fetch deliveries:', error)
        return
      }

      deliveries.value = data?.deliveries || []
      deliveryPagination.value = data?.pagination || null
    }
    catch (err) {
      console.error('Error fetching deliveries:', err)
    }
    finally {
      isLoadingDeliveries.value = false
    }
  }

  /**
   * Retry a failed delivery
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
