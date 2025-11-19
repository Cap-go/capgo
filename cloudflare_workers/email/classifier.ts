import type { Env, ParsedEmail } from './types'

export type EmailCategory = 'support' | 'sales' | 'query' | 'other'

export interface ClassificationResult {
  category: EmailCategory
  confidence: number
  shouldProcess: boolean
  reason?: string
}

/**
 * Classifies an email using Claude AI (Anthropic API)
 * Only support, sales, and query emails are processed
 */
export async function classifyEmail(
  env: Env,
  email: ParsedEmail,
): Promise<ClassificationResult> {
  console.log('🧠 classifyEmail: Starting AI classification...')
  console.log(`   Anthropic API key present: ${!!env.ANTHROPIC_API_KEY}`)
  console.log(`   Anthropic API key length: ${env.ANTHROPIC_API_KEY?.length || 0}`)

  try {
    const prompt = buildClassificationPrompt(email)
    console.log(`   Prompt length: ${prompt.length} characters`)

    console.log('🌐 Calling Anthropic API...')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest', // Fast and cost-effective for classification
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    console.log(`📡 Anthropic API response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Claude API error:', response.status, errorText)
      // Default to processing the email if classification fails
      return {
        category: 'query',
        confidence: 0,
        shouldProcess: true,
        reason: 'Classification failed, defaulting to processing',
      }
    }

    const data = await response.json() as any
    const content = data.content[0].text
    console.log(`✅ Claude response received: "${content}"`)

    // Parse the classification response
    const result = parseClassificationResponse(content)
    console.log(`📊 Parsed classification result:`, result)
    return result
  }
  catch (error) {
    console.error('Error classifying email:', error)
    // Default to processing on error
    return {
      category: 'query',
      confidence: 0,
      shouldProcess: true,
      reason: 'Classification error, defaulting to processing',
    }
  }
}

/**
 * Builds the classification prompt for Claude
 */
function buildClassificationPrompt(email: ParsedEmail): string {
  const bodyPreview = truncateText(email.body.text || email.body.html || '', 1000)

  return `You are an email classifier for a customer service system. Classify the following email into one of these categories:

1. **support** - Customer needs help with a problem, bug report, technical issue, or account issue
2. **sales** - Inquiry about pricing, purchasing, features, demos, or becoming a customer
3. **query** - General question, information request, or feedback
4. **other** - Spam, unrelated content, automated messages, or anything that doesn't fit the above

Email Details:
From: ${email.from.name || email.from.email}
Subject: ${email.subject}
Body:
${bodyPreview}

Respond in the following JSON format only (no other text):
{
  "category": "support|sales|query|other",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

Examples:
- "My app is crashing" → support
- "How much does the enterprise plan cost?" → sales
- "What features do you support?" → query
- "Unsubscribe me" → other
- "[AUTO-REPLY] Out of office" → other`
}

/**
 * Parses Claude's classification response
 */
function parseClassificationResponse(response: string): ClassificationResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])
    const category = parsed.category as EmailCategory
    const confidence = Number(parsed.confidence) || 0

    // Only process support, sales, and query emails
    const shouldProcess = ['support', 'sales', 'query'].includes(category)

    return {
      category,
      confidence,
      shouldProcess,
      reason: parsed.reason,
    }
  }
  catch (error) {
    console.error('Error parsing classification response:', error)
    // Default to processing if parsing fails
    return {
      category: 'query',
      confidence: 0,
      shouldProcess: true,
      reason: 'Failed to parse classification, defaulting to processing',
    }
  }
}

/**
 * Truncates text to specified length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength)
    return text
  return `${text.substring(0, maxLength)}...`
}

/**
 * Simple heuristic-based classification (fallback if AI is unavailable)
 * This is much less accurate but can work as a backup
 */
export function classifyEmailHeuristic(email: ParsedEmail): ClassificationResult {
  const subject = email.subject.toLowerCase()
  const body = (email.body.text || email.body.html || '').toLowerCase()
  const combined = `${subject} ${body}`

  // Check for spam/automated patterns
  const spamPatterns = [
    /unsubscribe/i,
    /auto.?reply/i,
    /out of office/i,
    /delivery failure/i,
    /mailer.?daemon/i,
    /no.?reply@/i,
  ]

  for (const pattern of spamPatterns) {
    if (pattern.test(combined)) {
      return {
        category: 'other',
        confidence: 0.8,
        shouldProcess: false,
        reason: 'Automated or spam message detected',
      }
    }
  }

  // Support keywords
  const supportKeywords = [
    'error', 'bug', 'crash', 'broken', 'not working', 'issue', 'problem',
    'help', 'support', 'fix', 'unable', 'can\'t', 'won\'t', 'doesn\'t work',
  ]

  // Sales keywords
  const salesKeywords = [
    'price', 'pricing', 'cost', 'purchase', 'buy', 'enterprise', 'demo',
    'trial', 'plan', 'subscription', 'quote', 'sales',
  ]

  // Query keywords
  const queryKeywords = [
    'how to', 'can i', 'is it possible', 'what is', 'documentation',
    'guide', 'tutorial', 'question', 'wondering',
  ]

  let supportScore = 0
  let salesScore = 0
  let queryScore = 0

  for (const keyword of supportKeywords) {
    if (combined.includes(keyword))
      supportScore++
  }

  for (const keyword of salesKeywords) {
    if (combined.includes(keyword))
      salesScore++
  }

  for (const keyword of queryKeywords) {
    if (combined.includes(keyword))
      queryScore++
  }

  // Determine category based on highest score
  if (supportScore > salesScore && supportScore > queryScore) {
    return {
      category: 'support',
      confidence: 0.6,
      shouldProcess: true,
      reason: 'Support keywords detected',
    }
  }

  if (salesScore > supportScore && salesScore > queryScore) {
    return {
      category: 'sales',
      confidence: 0.6,
      shouldProcess: true,
      reason: 'Sales keywords detected',
    }
  }

  if (queryScore > 0) {
    return {
      category: 'query',
      confidence: 0.5,
      shouldProcess: true,
      reason: 'Query keywords detected',
    }
  }

  // Default to query if nothing matches strongly
  return {
    category: 'query',
    confidence: 0.3,
    shouldProcess: true,
    reason: 'No clear category, defaulting to query',
  }
}
