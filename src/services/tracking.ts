import ky from 'ky'
import { defaultApiHost, useSupabase } from '~/services/supabase'

type TagKey = Lowercase<string>
/** Tag Type */
type Tags = Record<TagKey, string | number | boolean>
type Parser = 'markdown' | 'text'
/**
 * Options for publishing LogSnag events
 */
interface TrackOptions {
  /**
   * Channel name
   * example: "waitlist"
   */
  channel: string
  /**
   * Event name
   * example: "User Joined"
   */
  event: string
  /**
   * Event description
   * example: "joe@example.com joined waitlist"
   */
  description?: string
  /**
   * User ID
   * example: "user-123"
   */
  user_id?: string
  /**
   * Event icon (emoji)
   * must be a single emoji
   * example: "🎉"
   */
  icon?: string
  /**
   * Event tags
   * example: { username: "mattie" }
   */
  tags?: Tags
  /**
   * Send push notification
   */
  notify?: boolean
  /**
   * Parser for description
   */
  parser?: Parser
  /**
   * Event timestamp
   */
  timestamp?: number | Date
}

export async function sendEvent(payload: TrackOptions): Promise<void> {
  try {
    const { data: currentSession } = await useSupabase().auth.getSession()!
    if (!currentSession.session)
      return

    const currentJwt = currentSession.session.access_token
    const response = await ky.post(`${defaultApiHost}/private/events`, {
      json: payload,
      headers: {
        Authorization: `Bearer ${currentJwt}`,
      },
      timeout: 10000, // 10 seconds timeout
      retry: 3,
    }).json<{ error?: string }>()

    if (response.error) {
      console.error(`Failed to send LogSnag event: ${response.error}`)
    }
  }
  catch (error) {
    console.error('Failed to send LogSnag event', error)
  }
}
