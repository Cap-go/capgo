const BLOCKED_SENDERS = [
  'sonarcloud',
  'sonarqube',
  'socket-security',
  'sonar-cloud',
  'coderabbit',
  'code-rabbit',
  'codecov',
  'dependabot',
  'renovate',
  'snyk',
  'imgbot',
  'restyled',
  'linear',
  'gitguardian',
  'deepsource',
  'codacy',
  'coveralls',
  'circleci',
  'travis-ci',
  'netlify',
  'vercel',
]

// Content patterns that indicate automated bot messages
const BLOCKED_CONTENT_PATTERNS = [
  /snyk\s+(checks?|security|test)/i,
  /sonarcloud/i,
  /sonarqube/i,
  /code\s*coverage/i,
  /quality\s+gate/i,
  /socket\s+security/i,
  /linear\s+issue/i,
  /netlify\s+deploy/i,
  /vercel\s+deploy/i,
]

function isBlocked(payload) {
  const senderLogin = payload.sender?.login?.toLowerCase() || ''
  const commentAuthor = payload.comment?.user?.login?.toLowerCase() || ''
  const reviewAuthor = payload.review?.user?.login?.toLowerCase() || ''

  // Check if sender/author username contains blocked terms
  const isBlockedUser = BLOCKED_SENDERS.some(blocked =>
    senderLogin.includes(blocked) ||
    commentAuthor.includes(blocked) ||
    reviewAuthor.includes(blocked)
  )

  if (isBlockedUser) {
    return true
  }

  // Check if comment/review content contains bot patterns
  const commentBody = payload.comment?.body || ''
  const reviewBody = payload.review?.body || ''
  const combinedContent = `${commentBody} ${reviewBody}`.toLowerCase()

  const hasBlockedContent = BLOCKED_CONTENT_PATTERNS.some(pattern =>
    pattern.test(combinedContent)
  )

  return hasBlockedContent
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const url = new URL(request.url)
    const discordUrl = `https://discord.com${url.pathname}`

    const payload = await request.json()

    if (isBlocked(payload)) {
      console.log('Blocked sender detected, not forwarding to Discord webhook.', payload)
      return new Response('OK', { status: 200 })
    }

    console.log('Forwarding payload to Discord webhook.', discordUrl, payload)
    return fetch(discordUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': request.headers.get('User-Agent') || 'GitHub-Hookshot',
        'X-GitHub-Event': request.headers.get('X-GitHub-Event') || '',
        'X-GitHub-Delivery': request.headers.get('X-GitHub-Delivery') || '',
      },
      body: JSON.stringify(payload),
    })
  },
}
