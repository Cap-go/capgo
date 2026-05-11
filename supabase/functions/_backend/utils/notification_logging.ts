export function getRecipientEmailLogMetadata(email?: string | null) {
  return {
    hasRecipientEmail: typeof email === 'string' && email.trim().length > 0,
  }
}

export function getEventDataLogMetadata(eventData?: Record<string, unknown> | null) {
  const eventDataFieldCount = eventData ? Object.keys(eventData).length : 0
  return {
    hasEventData: eventDataFieldCount > 0,
    eventDataFieldCount,
  }
}
