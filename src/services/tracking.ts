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

export async function sendEvent(payload: TrackOptions): Promise<null> {
    return useSupabase().auth.getSession().then(({data: currentSession}) => {
      if (!currentSession.session)
        return null
  
      const currentJwt = currentSession.session.access_token
      return ky.post(`${defaultApiHost}/private/events`, {
       json: payload,
       headers: {
         Authorization: `Bearer ${currentJwt}`,
       },
       timeout: 10000, // 10 seconds timeout
       retry: 3,
     })
     .catch(() => null)
     .then(() => null)
    }).catch(() => null)
}
