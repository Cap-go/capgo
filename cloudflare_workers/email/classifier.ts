import type { EmailAttachment, Env, ParsedEmail } from './types'

export type EmailCategory = 'support' | 'sales' | 'query' | 'spam' | 'other'

export interface ClassificationResult {
  category: EmailCategory
  confidence: number
  shouldProcess: boolean
  reason?: string
}

export interface AttachmentClassification {
  attachment: EmailAttachment
  isUseful: boolean
  reason: string
}

export interface AttachmentFilterResult {
  usefulAttachments: EmailAttachment[]
  filteredOut: AttachmentClassification[]
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

  return `You are an email classifier for Capgo's customer service system.

**What is Capgo?**
Capgo is a live update and mobile app deployment platform for Capacitor apps (mobile applications). It allows developers to push over-the-air (OTA) updates to their iOS and Android apps without going through app store reviews. Capgo provides tools for managing app versions, channels, updates, and analytics for mobile app developers.

Classify the following email into one of these categories:

1. **support** - Customer needs help with a problem, bug report, technical issue, or account issue related to Capgo's mobile app update platform
2. **sales** - Inquiry about pricing, purchasing, features, demos, or becoming a Capgo customer
3. **query** - General question, information request, or feedback about Capgo's services
4. **spam** - Spam, marketing emails, phishing attempts, suspicious links, promotional content, or unsolicited bulk email
5. **other** - Automated messages (auto-replies, bounce messages), unsubscribe requests, or emails completely unrelated to Capgo's mobile app platform (e.g., industrial equipment, physical products, unrelated services)

**IMPORTANT**:
- If the email is completely unrelated to mobile apps, software development, or Capgo's services (e.g., requests for physical products, industrial equipment, unrelated business services), classify as "spam"
- If there are any indicators of spam, phishing, or unsolicited marketing, classify as "spam"
- These emails should NOT be processed

Spam indicators include:
- Suspicious links or attachments
- Generic greetings (no personalization)
- Mass marketing content
- Get-rich-quick schemes
- Requests for personal/financial information
- Poor grammar or spelling (typical of phishing)
- Urgency tactics or threats
- Unsolicited promotional content
- Multiple unrelated links
- Unsolicited business solicitations (RFQs, quotations, sourcing requests)
- Suspicious sender domains (.xyz, .top, .info, etc.)
- Generic B2B spam (supply chain, procurement requests from unknown companies)
- "To unsubscribe" instructions in body

Email Details:
From: ${email.from.name || email.from.email}
Subject: ${email.subject}
Body:
${bodyPreview}

Respond in the following JSON format only (no other text):
{
  "category": "support|sales|query|spam|other",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

Examples:
- "My app is crashing" → support
- "How much does the enterprise plan cost?" → sales
- "What features do you support?" → query
- "URGENT: Click here to claim your prize!" → spam
- "Unsubscribe me" → other
- "[AUTO-REPLY] Out of office" → other
- "Buy cheap meds online" → spam
- "Your account has been suspended, verify now" → spam
- "Request for quotation for valves" from unknown company → spam`
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

    // Only process support, sales, and query emails (NOT spam or other)
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

  // Check for automated message patterns (auto-replies, bounces)
  const automatedPatterns = [
    /auto.?reply/i,
    /out of office/i,
    /delivery failure/i,
    /mailer.?daemon/i,
    /no.?reply@/i,
    /returned mail/i,
    /mail delivery/i,
  ]

  for (const pattern of automatedPatterns) {
    if (pattern.test(combined)) {
      return {
        category: 'other',
        confidence: 0.9,
        shouldProcess: false,
        reason: 'Automated message detected',
      }
    }
  }

  // Check for spam/phishing patterns
  const spamPatterns = [
    /click here/i,
    /verify your account/i,
    /urgent.*action required/i,
    /suspended.*account/i,
    /claim.*prize/i,
    /congratulations.*won/i,
    /limited time offer/i,
    /act now/i,
    /buy.*cheap/i,
    /make money/i,
    /free.*money/i,
    /nigerian prince/i,
    /enlarge/i,
    /viagra/i,
    /casino/i,
    /lottery/i,
    /inheritance/i,
    /security alert/i,
    /confirm.*identity/i,
    /update.*payment/i,
    /crypto.*investment/i,
    // B2B spam patterns
    /request for quotation/i,
    /rfq.*quotation/i,
    /source and provide/i,
    /supply.*quotation/i,
    /procurement.*request/i,
    /tender.*invitation/i,
    /to unsubscribe reply/i,
    /quote.*earliest convenience/i,
  ]

  for (const pattern of spamPatterns) {
    if (pattern.test(combined)) {
      return {
        category: 'spam',
        confidence: 0.9,
        shouldProcess: false,
        reason: 'Spam or phishing indicators detected',
      }
    }
  }

  // Check for unsubscribe requests separately
  if (/unsubscribe/i.test(combined) && combined.length < 100) {
    return {
      category: 'other',
      confidence: 0.95,
      shouldProcess: false,
      reason: 'Unsubscribe request detected',
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

/**
 * Filters attachments using AI to keep only useful ones
 * Filters out tracking pixels, signature images, marketing content, etc.
 */
export async function filterAttachmentsWithAI(
  env: Env,
  attachments: EmailAttachment[],
): Promise<AttachmentFilterResult> {
  console.log('🧠 filterAttachmentsWithAI: Starting AI attachment filtering...')
  console.log(`   Total attachments to filter: ${attachments.length}`)

  if (attachments.length === 0) {
    return { usefulAttachments: [], filteredOut: [] }
  }

  // First, apply heuristic pre-filtering to reduce API calls
  const heuristicResult = filterAttachmentsHeuristic(attachments)
  console.log(`   Heuristic pre-filter: ${heuristicResult.filteredOut.length} obviously useless attachments`)

  // If all attachments are filtered out by heuristics, skip AI
  if (heuristicResult.usefulAttachments.length === 0) {
    console.log('   All attachments filtered by heuristics, skipping AI')
    return heuristicResult
  }

  // For remaining attachments, use AI for more nuanced filtering
  const remainingAttachments = heuristicResult.usefulAttachments
  console.log(`   Remaining attachments for AI analysis: ${remainingAttachments.length}`)

  try {
    const prompt = buildAttachmentFilterPrompt(remainingAttachments)
    console.log(`   Prompt length: ${prompt.length} characters`)

    console.log('🌐 Calling Anthropic API for attachment filtering...')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 500,
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
      // On error, keep all attachments that passed heuristics
      return heuristicResult
    }

    const data = await response.json() as any
    const content = data.content[0].text
    console.log(`✅ Claude response received: "${content}"`)

    // Parse the AI response
    const aiClassifications = parseAttachmentFilterResponse(content, remainingAttachments)

    // Combine AI results with heuristic filtered ones
    const usefulFromAI = aiClassifications.filter(c => c.isUseful).map(c => c.attachment)
    const filteredByAI = aiClassifications.filter(c => !c.isUseful)

    console.log(`📊 AI filtering result: ${usefulFromAI.length} useful, ${filteredByAI.length} filtered`)

    return {
      usefulAttachments: usefulFromAI,
      filteredOut: [...heuristicResult.filteredOut, ...filteredByAI],
    }
  }
  catch (error) {
    console.error('Error filtering attachments with AI:', error)
    // On error, keep all attachments that passed heuristics
    return heuristicResult
  }
}

/**
 * Builds the prompt for attachment filtering
 */
function buildAttachmentFilterPrompt(attachments: EmailAttachment[]): string {
  const attachmentList = attachments.map((att, i) => {
    const sizeKB = (att.size / 1024).toFixed(1)
    return `${i + 1}. Filename: "${att.filename}", Type: ${att.contentType}, Size: ${sizeKB}KB`
  }).join('\n')

  return `You are an email attachment filter for a customer support system.

Analyze these email attachments and determine which ones are USEFUL for customer support.

**FILTER OUT (not useful):**
- Tracking pixels (tiny 1x1 images, usually named with random IDs)
- Email signature images (logo.png, signature.png, company logos)
- Social media icons (facebook.png, twitter.png, linkedin.png, etc.)
- Marketing banners and promotional images
- Spacer images (spacer.gif, blank.gif)
- Email template elements (header.png, footer.png, divider.png)
- Generic icons (icon-*.png, *.ico files)
- Images with names like: pixel, tracker, beacon, spacer, blank, logo, sig, signature, banner, ad
- Very small images (under 5KB unless they're documents)

**KEEP (useful):**
- Screenshots (usually larger, may have "screen", "capture", "screenshot" in name)
- User-provided documents (PDF, DOC, DOCX, XLS, XLSX, CSV, TXT)
- Error logs or crash reports
- App-related images the user is sharing for support
- Larger images that could be screenshots or important visuals (>50KB)
- ZIP files with user data

Attachments to analyze:
${attachmentList}

Respond in JSON format with an array of decisions:
{
  "decisions": [
    { "index": 1, "useful": true, "reason": "Screenshot of error" },
    { "index": 2, "useful": false, "reason": "Company logo in signature" }
  ]
}

Only output the JSON, nothing else.`
}

/**
 * Parses the AI response for attachment filtering
 */
function parseAttachmentFilterResponse(
  response: string,
  attachments: EmailAttachment[],
): AttachmentClassification[] {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])
    const decisions = parsed.decisions as Array<{ index: number, useful: boolean, reason: string }>

    return attachments.map((attachment, i) => {
      const decision = decisions.find(d => d.index === i + 1)
      if (decision) {
        return {
          attachment,
          isUseful: decision.useful,
          reason: decision.reason,
        }
      }
      // If AI didn't provide a decision, keep the attachment
      return {
        attachment,
        isUseful: true,
        reason: 'No AI decision, keeping by default',
      }
    })
  }
  catch (error) {
    console.error('Error parsing attachment filter response:', error)
    // On parse error, keep all attachments
    return attachments.map(attachment => ({
      attachment,
      isUseful: true,
      reason: 'Parse error, keeping by default',
    }))
  }
}

/**
 * Heuristic-based attachment filtering (fast, no API call)
 * Used for obvious cases and as a pre-filter before AI
 */
export function filterAttachmentsHeuristic(
  attachments: EmailAttachment[],
): AttachmentFilterResult {
  const usefulAttachments: EmailAttachment[] = []
  const filteredOut: AttachmentClassification[] = []

  for (const attachment of attachments) {
    const classification = classifyAttachmentHeuristic(attachment)
    if (classification.isUseful) {
      usefulAttachments.push(attachment)
    }
    else {
      filteredOut.push(classification)
    }
  }

  return { usefulAttachments, filteredOut }
}

/**
 * Classifies a single attachment using heuristics
 */
function classifyAttachmentHeuristic(attachment: EmailAttachment): AttachmentClassification {
  const filename = attachment.filename.toLowerCase()
  const contentType = attachment.contentType.toLowerCase()
  const size = attachment.size

  // Documents are always useful
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument',
    'application/vnd.ms-excel',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip',
    'application/json',
    'application/xml',
    'text/xml',
  ]

  for (const docType of documentTypes) {
    if (contentType.includes(docType)) {
      return {
        attachment,
        isUseful: true,
        reason: 'Document file',
      }
    }
  }

  // Check for document extensions
  const docExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.zip', '.json', '.xml', '.log']
  for (const ext of docExtensions) {
    if (filename.endsWith(ext)) {
      return {
        attachment,
        isUseful: true,
        reason: 'Document file by extension',
      }
    }
  }

  // For images, apply filtering rules
  if (contentType.startsWith('image/')) {
    // Tracking pixels - very small images
    if (size < 1000) { // Under 1KB
      return {
        attachment,
        isUseful: false,
        reason: 'Tracking pixel (image under 1KB)',
      }
    }

    // Signature/logo patterns
    const signaturePatterns = [
      /logo/i,
      /signature/i,
      /^sig[_-]/i,
      /banner/i,
      /header/i,
      /footer/i,
      /icon[_-]/i,
      /spacer/i,
      /blank/i,
      /pixel/i,
      /tracker/i,
      /beacon/i,
      /divider/i,
      /separator/i,
      /facebook/i,
      /twitter/i,
      /linkedin/i,
      /instagram/i,
      /youtube/i,
      /social/i,
      /email[_-]?icon/i,
      /mail[_-]?icon/i,
    ]

    for (const pattern of signaturePatterns) {
      if (pattern.test(filename)) {
        return {
          attachment,
          isUseful: false,
          reason: `Email signature/marketing element (matches: ${pattern})`,
        }
      }
    }

    // Small images with generic names are likely signature elements
    if (size < 10000) { // Under 10KB
      const genericImagePatterns = [
        /^img[_-]?\d/i,
        /^image[_-]?\d/i,
        /^[a-f0-9]{8,}/i, // Random hex IDs
        /^\d+\.(?:png|jpg|gif)$/i, // Just numbers as filename
        /^(?:un)?named/i,
        /^cid:/i,
      ]

      for (const pattern of genericImagePatterns) {
        if (pattern.test(filename)) {
          return {
            attachment,
            isUseful: false,
            reason: `Generic small image (${(size / 1024).toFixed(1)}KB)`,
          }
        }
      }
    }

    // Larger images are likely screenshots or user content
    if (size > 50000) { // Over 50KB
      return {
        attachment,
        isUseful: true,
        reason: 'Large image (likely screenshot or user content)',
      }
    }

    // Screenshot indicators
    if (/screen|capture|screenshot|snap/i.test(filename)) {
      return {
        attachment,
        isUseful: true,
        reason: 'Screenshot by filename',
      }
    }

    // Medium-sized images - let AI decide
    return {
      attachment,
      isUseful: true, // Keep for AI to review
      reason: 'Medium image - needs AI review',
    }
  }

  // Unknown content type - keep it
  return {
    attachment,
    isUseful: true,
    reason: 'Unknown content type, keeping by default',
  }
}
