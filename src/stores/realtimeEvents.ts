import type { RealtimeChannel } from '@supabase/supabase-js'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from './main'

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
  
  const channel = ref<RealtimeChannel | null>(null)
  const isSubscribed = ref(false)
  const isSubscribing = ref(false)
  const lastEvent = ref<NavigationEvent | null>(null)

  const handleNavigationEvent = async (payload: NavigationEvent) => {
    lastEvent.value = payload

    try {
      // Route to the appropriate page based on event type
      switch (payload.type) {
        case 'app:created':
          // Navigate to the app page
          await router.push(`/app/${payload.data.appId}`)
          break
        
        case 'bundle:uploaded':
          // Navigate to the bundle page if bundleId is provided
          if (payload.data.bundleId) {
            await router.push(`/app/${payload.data.appId}/bundle/${payload.data.bundleId}`)
          }
          else {
            // Fall back to bundles list
            await router.push(`/app/${payload.data.appId}/bundles`)
          }
          break
        
        case 'logs:error':
          // Navigate to the logs page
          await router.push(`/app/${payload.data.appId}/logs`)
          break
      }
    }
    catch (error) {
      console.error('Navigation failed for event:', payload, error)
    }
  }

  const subscribe = () => {
    // Don't subscribe if already subscribed or subscribing
    if (isSubscribed.value || isSubscribing.value || !mainStore.auth) {
      return
    }

    // Get current organization ID (user ID is org ID in this system)
    const orgId = mainStore.auth.id
    if (!orgId) {
      console.warn('Cannot subscribe to navigation events: no org ID')
      return
    }

    isSubscribing.value = true
    const channelName = `navigation:${orgId}`

    // Create and subscribe to the channel
    channel.value = supabase
      .channel(channelName)
      .on('broadcast', { event: 'navigation' }, (payload) => {
        handleNavigationEvent(payload.payload as NavigationEvent)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed.value = true
          isSubscribing.value = false
        }
        else if (status === 'CHANNEL_ERROR') {
          console.error('Error subscribing to navigation events')
          isSubscribed.value = false
          isSubscribing.value = false
        }
        else if (status === 'TIMED_OUT') {
          console.error('Subscription to navigation events timed out')
          isSubscribed.value = false
          isSubscribing.value = false
        }
        else if (status === 'CLOSED') {
          isSubscribed.value = false
          isSubscribing.value = false
        }
      })
  }

  const unsubscribe = async () => {
    if (channel.value) {
      await supabase.removeChannel(channel.value)
      channel.value = null
      isSubscribed.value = false
      isSubscribing.value = false
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
