const BLOCKED_SENDERS = [
  'sonarcloud',
  'sonarqube',
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
