import type { RealtimeChannel } from '@supabase/supabase-js'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from './main'
import { useOrganizationStore } from './organization'

interface NavigationEvent {
  type: 'app:created' | 'bundle:uploaded' | 'logs:error'
  data: {
    appId: string
    bundleId?: string
    bundleName?: string
  }
}

export const useRealtimeEventsStore = defineStore('realtimeEvents', () => {
  const supabase = useSupabase()
  const router = useRouter()
  const mainStore = useMainStore()
  const organizationStore = useOrganizationStore()
  
  const channel = ref<RealtimeChannel | null>(null)
  const isSubscribed = ref(false)
  const lastEvent = ref<NavigationEvent | null>(null)

  const handleNavigationEvent = (payload: NavigationEvent) => {
    console.log('Navigation event received:', payload)
    lastEvent.value = payload

    // Route to the appropriate page based on event type
    switch (payload.type) {
      case 'app:created':
        // Navigate to the app page
        router.push(`/app/${payload.data.appId}`)
        break
      
      case 'bundle:uploaded':
        // Navigate to the bundle page if bundleId is provided
        if (payload.data.bundleId) {
          router.push(`/app/${payload.data.appId}/bundle/${payload.data.bundleId}`)
        }
        else {
          // Fall back to bundles list
          router.push(`/app/${payload.data.appId}/bundles`)
        }
        break
      
      case 'logs:error':
        // Navigate to the logs page
        router.push(`/app/${payload.data.appId}/logs`)
        break
    }
  }

  const subscribe = () => {
    // Don't subscribe if already subscribed
    if (isSubscribed.value || !mainStore.auth) {
      return
    }

    // Get current organization ID (user ID is org ID in this system)
    const orgId = mainStore.auth.id
    if (!orgId) {
      console.warn('Cannot subscribe to navigation events: no org ID')
      return
    }

    const channelName = `navigation:${orgId}`
    console.log(`Subscribing to navigation events on channel: ${channelName}`)

    // Create and subscribe to the channel
    channel.value = supabase
      .channel(channelName)
      .on('broadcast', { event: 'navigation' }, (payload) => {
        handleNavigationEvent(payload.payload as NavigationEvent)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed.value = true
          console.log('Successfully subscribed to navigation events')
        }
        else if (status === 'CHANNEL_ERROR') {
          console.error('Error subscribing to navigation events')
          isSubscribed.value = false
        }
        else if (status === 'TIMED_OUT') {
          console.error('Subscription to navigation events timed out')
          isSubscribed.value = false
        }
        else if (status === 'CLOSED') {
          console.log('Navigation events channel closed')
          isSubscribed.value = false
        }
      })
  }

  const unsubscribe = async () => {
    if (channel.value) {
      console.log('Unsubscribing from navigation events')
      await supabase.removeChannel(channel.value)
      channel.value = null
      isSubscribed.value = false
    }
  }

  return {
    isSubscribed,
    lastEvent,
    subscribe,
    unsubscribe,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useRealtimeEventsStore, import.meta.hot))
