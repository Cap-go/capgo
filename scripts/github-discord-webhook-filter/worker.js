const BLOCKED_SENDERS = [
  'sonarcloud',
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

function isBlocked(payload) {
  const senderLogin = payload.sender?.login?.toLowerCase() || ''
  const commentAuthor = payload.comment?.user?.login?.toLowerCase() || ''
  const reviewAuthor = payload.review?.user?.login?.toLowerCase() || ''

  return BLOCKED_SENDERS.some(blocked =>
    senderLogin.includes(blocked) ||
    commentAuthor.includes(blocked) ||
    reviewAuthor.includes(blocked)
  )
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
}
