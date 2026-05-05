import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import Stripe from 'stripe'
import { simpleError } from './hono.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import { supabaseAdmin } from './supabase.ts'
import { getEnv, isStripeConfigured } from './utils.ts'

const ISO_COUNTRY_CODE_REGEX = /^[A-Z]{2}$/
const TRAILING_SLASHES_REGEX = /\/+$/

// Checks if SUPABASE_URL points to a local instance
function isLocalSupabase(c: Context): boolean {
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  if (!supabaseUrl)
    return false
  return supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')
}

// Extracts the Supabase project ID from SUPABASE_URL
// e.g., "https://sb.capgo.app" -> "sb.capgo.app"
function getSupabaseProjectId(c: Context): string | null {
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  if (!supabaseUrl)
    return null
  return supabaseUrl.split('//')[1]?.split('.')[0]?.split(':')[0] || null
}

// Builds a Supabase dashboard link to the orgs table filtered by customer_id
function buildSupabaseDashboardLink(c: Context, customerId: string): string | null {
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  if (!supabaseUrl)
    return null

  // Local Supabase Studio runs on API port + 2 (default: 54321 -> 54323).
  if (isLocalSupabase(c)) {
    try {
      const api = new URL(supabaseUrl)
      const apiPort = Number.parseInt(api.port || '54321', 10)
      const studioPort = apiPort + 2
      return `${api.protocol}//${api.hostname}:${studioPort}/project/default/editor/445780?schema=public&filter=customer_id%3Aeq%3A${customerId}`
    }
    catch {
      return `http://127.0.0.1:54323/project/default/editor/445780?schema=public&filter=customer_id%3Aeq%3A${customerId}`
    }
  }

  const projectId = getSupabaseProjectId(c)
  if (!projectId)
    return null
  // 445780 is the orgs table ID in Supabase
  return `https://supabase.com/dashboard/project/${projectId}/editor/445780?schema=public&filter=customer_id%3Aeq%3A${customerId}`
}

export type StripeEnvironment = 'live' | 'test'

export function resolveStripeEnvironment(c: Context): StripeEnvironment {
  const secretKey = getEnv(c, 'STRIPE_SECRET_KEY') || ''
  if (secretKey.startsWith('sk_live') || secretKey.startsWith('rk_live'))
    return 'live'
  return 'test'
}

function getStripeApiBaseUrl(c: Context): URL | null {
  const rawBaseUrl = getEnv(c, 'STRIPE_API_BASE_URL').trim()
  if (!rawBaseUrl)
    return null

  let parsedBaseUrl: URL
  try {
    parsedBaseUrl = new URL(rawBaseUrl)
  }
  catch {
    throw new Error('Invalid STRIPE_API_BASE_URL')
  }

  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    throw new Error('STRIPE_API_BASE_URL must use http or https')
  }

  if (parsedBaseUrl.pathname !== '/' && parsedBaseUrl.pathname !== '') {
    throw new Error('STRIPE_API_BASE_URL must not include a path')
  }

  return parsedBaseUrl
}

export function isStripeEmulatorEnabled(c: Context): boolean {
  return getStripeApiBaseUrl(c) !== null
}

export function getStripe(c: Context): Stripe {
  const apiBaseUrl = getStripeApiBaseUrl(c)
  const apiPort = apiBaseUrl
    ? Number.parseInt(apiBaseUrl.port || (apiBaseUrl.protocol === 'https:' ? '443' : '80'), 10)
    : undefined
  type StripeApiVersion = NonNullable<ConstructorParameters<typeof Stripe>[1]>['apiVersion']

  return new Stripe(getEnv(c, 'STRIPE_SECRET_KEY'), {
    // Keep the pinned runtime API version even when the installed SDK types lag behind it.
    apiVersion: '2026-03-25.dahlia' as StripeApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
    ...(apiBaseUrl
      ? {
          host: apiBaseUrl.hostname,
          port: apiPort,
          protocol: apiBaseUrl.protocol.replace(':', '') as 'http' | 'https',
        }
      : {}),
  })
}

export async function getSubscriptionData(c: Context, customerId: string, subscriptionId: string | null) {
  if (!subscriptionId)
    return null
  try {
    cloudlog({ requestId: c.get('requestId'), message: 'Fetching subscription data', customerId, subscriptionId })

    // Retrieve the specific subscription from Stripe
    const subscription = await getStripe(c).subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'], // Correct expand path for retrieve
    })

    cloudlog({
      requestId: c.get('requestId'),
      context: 'getSubscriptionData',
      // subscriptionsFound: subscriptions.data.length, // Removed - retrieve returns one or throws
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    })

    // // Get the subscription - Removed: already have the subscription object
    // const subscription = subscriptions.data[0]

    // Extract product ID from the first subscription item
    let productId = null
    if (subscription.items.data.length > 0) {
      const item = subscription.items.data[0]
      // Ensure price and product are objects before accessing properties
      if (typeof item.price === 'object' && item.price !== null && typeof item.price.product === 'string') {
        productId = item.price.product
      }
      else {
        cloudlog({ requestId: c.get('requestId'), message: 'Price or product data missing/invalid type in subscription item', itemId: item.id })
      }
    }

    // subscription.billing_cycle_anchor - Not used, using current period from item
    // Format dates from epoch to ISO string
    // Access cycle dates from the first item
    const firstItem = subscription.items.data.length > 0 ? subscription.items.data[0] : null

    const cycleStart = firstItem?.current_period_start
      ? new Date(firstItem.current_period_start * 1000).toISOString()
      : null

    const cycleEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000).toISOString()
      : null

    return {
      productId,
      status: subscription.status,
      cycleStart,
      cycleEnd,
      subscriptionId: subscription.id,
      cancel_at_period_end: subscription.cancel_at_period_end,
    }
  }
  catch (error) {
    // Handle specific Stripe errors if needed, e.g., resource_missing
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') {
      cloudlog({ requestId: c.get('requestId'), message: 'Subscription not found', subscriptionId, error: error.code })
    }
    else {
      cloudlogErr({ requestId: c.get('requestId'), message: 'getSubscriptionData', error })
    }
    return null
  }
}

/**
 * Fetches cancellation details for a Stripe subscription, if available.
 */
export async function getCancellationDetails(c: Context, subscriptionId: string | null): Promise<Stripe.Subscription.CancellationDetails | null> {
  if (!subscriptionId)
    return null
  if (!isStripeConfigured(c))
    return null

  try {
    const subscription = await getStripe(c).subscriptions.retrieve(subscriptionId)
    return subscription.cancellation_details ?? null
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getCancellationDetails', error, subscriptionId })
    return null
  }
}

async function getActiveSubscription(c: Context, customerId: string, subscriptionId: string | null) {
  cloudlog({ requestId: c.get('requestId'), message: 'Stored subscription not active or not found, checking for others.', customerId, storedSubscriptionId: subscriptionId })

  // Try to find active subscriptions first
  let activeSubscriptions = await getStripe(c).subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  })

  // If no active subscriptions, check for trialing subscriptions
  if (activeSubscriptions.data.length === 0) {
    activeSubscriptions = await getStripe(c).subscriptions.list({
      customer: customerId,
      status: 'trialing', // Check for trial subscriptions
      limit: 1,
    })
  }

  if (activeSubscriptions.data.length > 0) {
    const activeSub = activeSubscriptions.data[0]
    cloudlog({ requestId: c.get('requestId'), message: 'Found an active or trialing subscription, fetching its data.', activeSubscriptionId: activeSub.id, status: activeSub.status })
    // Fetch data for the newly found active subscription
    return getSubscriptionData(c, customerId, activeSub.id)
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'No other active or trialing subscriptions found for customer.', customerId })
    // Keep subscriptionData as null or the inactive one, it will be handled below
  }
  return null
}

export async function syncSubscriptionData(c: Context, customerId: string, subscriptionId: string | null): Promise<void> {
  if (!isStripeConfigured(c))
    return
  try {
    // Get subscription data from Stripe using the ID stored in our DB
    let subscriptionData = await getSubscriptionData(c, customerId, subscriptionId)

    // If the stored subscription is not active or doesn't exist, check for any other active subscriptions
    if (!subscriptionData || (subscriptionData.status !== 'active' && subscriptionData.status !== 'trialing')) {
      subscriptionData = await getActiveSubscription(c, customerId, subscriptionId)
    }

    let dbStatus: 'succeeded' | 'canceled' | undefined = 'canceled'

    if (subscriptionData) {
      // Determine DB status based on the potentially updated subscription data
      if (subscriptionData.status === 'canceled') {
        // Only apply 'active until period end' logic if Stripe status is 'canceled'
        if (subscriptionData.cycleEnd && new Date(subscriptionData.cycleEnd) > new Date()) {
          dbStatus = 'succeeded' // Still active until period end because cycleEnd is future
        }
      }
      else if (subscriptionData.status === 'active' || subscriptionData.status === 'trialing') {
        // Active and trialing subscriptions are always considered succeeded
        dbStatus = 'succeeded'
      }
    }

    // Update stripe_info table with latest data, even if no subscription exists
    const updateData: any = {
      status: dbStatus,
    }

    // Only include fields if they have valid values to avoid foreign key constraint violations
    if (subscriptionData?.productId) {
      updateData.product_id = subscriptionData.productId
    }
    if (subscriptionData?.subscriptionId) {
      updateData.subscription_id = subscriptionData.subscriptionId
    }
    if (subscriptionData?.cycleStart) {
      updateData.subscription_anchor_start = subscriptionData.cycleStart
    }
    if (subscriptionData?.cycleEnd) {
      updateData.subscription_anchor_end = subscriptionData.cycleEnd
    }

    const { error: updateError } = await supabaseAdmin(c)
      .from('stripe_info')
      .update(updateData)
      .eq('customer_id', customerId)

    if (updateError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'syncSubscriptionData', error: updateError })
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'syncSubscriptionData', error })
  }
}

export async function createPortal(c: Context, customerId: string, callbackUrl: string) {
  if (!isStripeConfigured(c))
    return { url: '' }
  const allowedReturnUrl = getAllowedRedirectUrl(c, callbackUrl, 'return_url')
  const session = await getStripe(c).billingPortal.sessions.create({
    customer: customerId,
    return_url: allowedReturnUrl,
  })
  return { url: session.url }
}

export function updateCustomerEmail(c: Context, customerId: string, newEmail: string) {
  if (!isStripeConfigured(c))
    return Promise.resolve()
  return getStripe(c).customers.update(customerId, { email: newEmail, metadata: { email: newEmail } },
  )
}

export function updateCustomerOrganizationName(c: Context, customerId: string, newName: string) {
  if (!isStripeConfigured(c))
    return Promise.resolve()
  return getStripe(c).customers.update(customerId, { name: newName })
}

export async function getStripeCustomerName(c: Context, customerId: string | null | undefined): Promise<string | null | undefined> {
  if (!customerId || !isStripeConfigured(c))
    return undefined

  try {
    const customer = await getStripe(c).customers.retrieve(customerId)
    if (customer.deleted)
      return null
    return customer.name ?? null
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getStripeCustomerName', customerId, error })
    return undefined
  }
}

export function isDeterministicStripeCustomerUpdateError(error: unknown) {
  return error instanceof Stripe.errors.StripeAuthenticationError
    || error instanceof Stripe.errors.StripeInvalidRequestError
    || error instanceof Stripe.errors.StripePermissionError
    || error instanceof Stripe.errors.StripeRateLimitError
}

export function normalizeStripeCountryCode(country: string | null | undefined): string | null {
  if (!country)
    return null

  const normalized = country.trim().toUpperCase()
  if (!normalized || !ISO_COUNTRY_CODE_REGEX.test(normalized))
    return null

  return normalized
}

export async function getStripeCustomerCountry(c: Context, customerId: string | null | undefined): Promise<string | null | undefined> {
  if (!customerId || !isStripeConfigured(c))
    return undefined

  try {
    const customer = await getStripe(c).customers.retrieve(customerId)
    if (customer.deleted)
      return null
    return normalizeStripeCountryCode(customer.address?.country ?? null)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getStripeCustomerCountry', customerId, error })
    return undefined
  }
}

export async function syncStripeCustomerCountry(c: Context, customerId: string | null | undefined): Promise<string | null | undefined> {
  if (!customerId || !isStripeConfigured(c))
    return undefined

  const customerCountry = await getStripeCustomerCountry(c, customerId)
  if (customerCountry === undefined)
    return undefined

  const { data, error } = await supabaseAdmin(c)
    .from('stripe_info')
    .update({ customer_country: customerCountry })
    .eq('customer_id', customerId)
    .select('customer_id')

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'syncStripeCustomerCountry', customerId, error })
  }
  else if (!data?.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'syncStripeCustomerCountry no stripe_info row matched', customerId, customerCountry })
  }

  return customerCountry
}

export async function cancelSubscription(c: Context, customerId: string) {
  if (!isStripeConfigured(c))
    return Promise.resolve()
  const allSubscriptions = await getStripe(c).subscriptions.list({
    customer: customerId,
  })
  return Promise.all(
    allSubscriptions.data.map(sub => getStripe(c).subscriptions.cancel(sub.id)),
  ).catch((err) => {
    cloudlogErr({ requestId: c.get('requestId'), message: 'cancelSubscription', error: err })
  })
}

async function getStoredPlanPriceId(c: Context, planId: string, recurrence: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin(c)
      .from('plans')
      .select('price_m_id, price_y_id')
      .eq('stripe_id', planId)
      .single()

    if (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'getStoredPlanPriceId', planId, recurrence, error })
      return null
    }

    return recurrence === 'year' ? data.price_y_id : data.price_m_id
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getStoredPlanPriceId', planId, recurrence, error })
    return null
  }
}

async function getPriceIds(c: Context, planId: string, recurrence: string): Promise<{ priceId: string | null }> {
  let priceId = null
  if (!isStripeConfigured(c))
    return { priceId }
  try {
    const prices = await listPricesByProduct(c, planId)
    cloudlog({ requestId: c.get('requestId'), message: 'prices stripe', prices })
    prices.data.forEach((price) => {
      if (price.recurring && price.recurring.interval === recurrence && price.active && price.recurring.usage_type === 'licensed')
        priceId = price.id
    })
  }
  catch (err) {
    cloudlog({ requestId: c.get('requestId'), message: 'search err', error: err })
  }
  if (!priceId) {
    priceId = await getStoredPlanPriceId(c, planId, recurrence)
    cloudlog({ requestId: c.get('requestId'), message: 'prices fallback', planId, recurrence, priceId })
  }
  return { priceId }
}

export interface MeteredData {
  [key: string]: string
}

export interface CreditCheckoutItemSummary {
  [key: string]: string | number | null
  id: string | null
  quantity: number | null
  priceId: string | null
  productId: string | null
}

export interface CreditCheckoutDetails {
  creditQuantity: number
  itemsSummary: CreditCheckoutItemSummary[]
}

export interface StripeData {
  data: Database['public']['Tables']['stripe_info']['Insert']
  isUpgrade: boolean
  previousPriceId: string | undefined
  previousProductId: string | undefined
}

export function parsePriceIds(c: Context, prices: Stripe.SubscriptionItem[]): { priceId: string | null, productId: string | null } {
  let priceId: string | null = null
  let productId: string | null = null
  if (!isStripeConfigured(c))
    return { priceId, productId }
  try {
    cloudlog({ requestId: c.get('requestId'), message: 'prices stripe', prices })
    prices.forEach((price) => {
      if (price.plan.usage_type === 'licensed') {
        priceId = price.plan.id
        productId = price.plan.product as string
      }
    })
  }
  catch (err) {
    cloudlog({ requestId: c.get('requestId'), message: 'search err', error: err })
  }
  return { priceId, productId }
}

export async function createCheckout(c: Context, customerId: string, recurrence: string, planId: string, successUrl: string, cancelUrl: string, clientReferenceId?: string, attributionId?: string) {
  if (!isStripeConfigured(c))
    return { url: '' }
  const prices = await getPriceIds(c, planId, recurrence)
  cloudlog({ requestId: c.get('requestId'), message: 'prices', prices })
  if (!prices.priceId)
    return Promise.reject(new Error('Cannot find price'))
  const metadata = attributionId ? { attribution_id: attributionId } : undefined
  const allowedSuccessUrl = getAllowedRedirectUrl(c, successUrl, 'success_url')
  const allowedCancelUrl = getAllowedRedirectUrl(c, cancelUrl, 'cancel_url')
  const session = await getStripe(c).checkout.sessions.create({
    billing_address_collection: 'auto',
    mode: 'subscription',
    customer: customerId,
    success_url: `${allowedSuccessUrl}?success=true`,
    cancel_url: allowedCancelUrl,
    automatic_tax: { enabled: true },
    client_reference_id: clientReferenceId,
    metadata,
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
    tax_id_collection: { enabled: true },
    line_items: [
      {
        price: prices.priceId,
        quantity: 1,
      },
    ],
  })
  return { url: session.url }
}

async function listPricesByProduct(c: Context, productId: string, active?: boolean) {
  return await getStripe(c).prices.list({
    product: productId,
    ...(active === undefined ? {} : { active }),
    limit: 100,
  })
}

async function getOneTimePriceId(c: Context, productId: string): Promise<string | null> {
  if (!isStripeConfigured(c))
    return null
  try {
    const prices = await listPricesByProduct(c, productId, true)

    for (const price of prices.data) {
      if (price.type === 'one_time' && price.active)
        return price.id
    }
  }
  catch (err) {
    cloudlog({ requestId: c.get('requestId'), message: 'search one-time price error', error: err })
  }
  return null
}

export async function createOneTimeCheckout(
  c: Context,
  customerId: string,
  productId: string,
  quantity: number,
  successUrl: string,
  cancelUrl: string,
  clientReferenceId?: string,
) {
  if (!isStripeConfigured(c))
    return { url: '' }

  const priceId = await getOneTimePriceId(c, productId)
  if (!priceId)
    throw new Error(`Cannot find one-time price for product ${productId}`)

  const allowedSuccessUrl = getAllowedRedirectUrl(c, successUrl, 'success_url')
  const allowedCancelUrl = getAllowedRedirectUrl(c, cancelUrl, 'cancel_url')
  const successUrlWithFlag = allowedSuccessUrl.includes('?') ? `${allowedSuccessUrl}&success=true` : `${allowedSuccessUrl}?success=true`

  const session = await getStripe(c).checkout.sessions.create({
    billing_address_collection: 'auto',
    mode: 'payment',
    customer: customerId,
    success_url: successUrlWithFlag,
    cancel_url: allowedCancelUrl,
    automatic_tax: { enabled: true },
    client_reference_id: clientReferenceId,
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
    tax_id_collection: { enabled: true },
    invoice_creation: { enabled: true },
    line_items: [
      {
        price: priceId,
        quantity,
        ...(isStripeEmulatorEnabled(c)
          ? {}
          : {
              adjustable_quantity: {
                enabled: true,
                minimum: 1,
                maximum: 100000,
              },
            }),
      },
    ],
    metadata: {
      productId,
      orgId: clientReferenceId ?? '',
      intendedQuantity: String(quantity),
    },
  })
  return { url: session.url }
}

export async function getCreditCheckoutDetails(c: Context, session: Stripe.Checkout.Session, expectedProductId: string): Promise<CreditCheckoutDetails> {
  try {
    const lineItems = await getStripe(c).checkout.sessions.listLineItems(session.id, {
      expand: ['data.price.product'],
      limit: 100,
    })

    let creditQuantity = 0
    const itemsSummary = lineItems.data.map((item) => {
      const priceProduct = typeof item.price?.product === 'string'
        ? item.price.product
        : (item.price?.product as { id?: string } | null)?.id ?? null

      if (priceProduct === expectedProductId)
        creditQuantity += item.quantity ?? 0

      return {
        id: item.id ?? null,
        quantity: item.quantity ?? null,
        priceId: item.price?.id ?? null,
        productId: priceProduct,
      }
    })

    return {
      creditQuantity,
      itemsSummary,
    }
  }
  catch (error) {
    if (!isStripeEmulatorEnabled(c))
      throw error

    const metadataProductId = typeof session.metadata?.productId === 'string'
      ? session.metadata.productId
      : null
    const intendedQuantity = Number.parseInt(session.metadata?.intendedQuantity ?? '', 10)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Falling back to Stripe checkout metadata for credit checkout details',
      sessionId: session.id,
      expectedProductId,
      metadataProductId,
      error: error instanceof Error ? error.message : String(error),
    })

    if (metadataProductId === expectedProductId && Number.isFinite(intendedQuantity) && intendedQuantity > 0) {
      return {
        creditQuantity: intendedQuantity,
        itemsSummary: [
          {
            id: null,
            quantity: intendedQuantity,
            priceId: null,
            productId: metadataProductId,
          },
        ],
      }
    }

    return {
      creditQuantity: 0,
      itemsSummary: [],
    }
  }
}

function getAllowedRedirectUrl(c: Context, value: string, field: 'return_url' | 'success_url' | 'cancel_url') {
  const baseWebAppUrl = getEnv(c, 'WEBAPP_URL')
  if (!baseWebAppUrl)
    throw simpleError('invalid_redirect_url', 'WEBAPP_URL is not configured', { field })

  let baseUrl: URL
  let redirectUrl: URL
  try {
    baseUrl = new URL(baseWebAppUrl)
    redirectUrl = new URL(value, baseUrl)
  }
  catch {
    throw simpleError('invalid_redirect_url', `Invalid ${field}`, { field, value })
  }

  if (baseUrl.origin !== redirectUrl.origin)
    throw simpleError('invalid_redirect_url', `Invalid ${field}`, { field, value, expectedOrigin: baseUrl.origin })

  return redirectUrl.toString()
}

export interface StripeCustomer {
  id: string
  email: string
  name: string
  metadata: {
    user_id: string
    org_id?: string
    console?: string
    log_as?: string
  }
}

export async function createCustomer(c: Context, email: string, userId: string, orgId: string, name: string) {
  cloudlog({ requestId: c.get('requestId'), message: 'createCustomer', email, userId, orgId, name })
  const baseConsoleUrl = (getEnv(c, 'WEBAPP_URL') || '').replace(TRAILING_SLASHES_REGEX, '')
  const metadata: Record<string, string> = {
    user_id: userId,
    org_id: orgId,
  }
  if (baseConsoleUrl) {
    metadata.log_as = `${baseConsoleUrl}/log-as/${userId}`
  }
  if (!isStripeConfigured(c)) {
    cloudlog({ requestId: c.get('requestId'), message: 'createCustomer no stripe key', email, userId, name })
    // create a fake customer id like stripe one and random id
    const randomId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    return { id: `cus_${randomId}`, email, name, metadata }
  }
  const customer = await getStripe(c).customers.create({
    email,
    name,
    metadata,
  })
  // Add supabase dashboard link with the real customer ID after creation
  const supabaseLink = buildSupabaseDashboardLink(c, customer.id)
  if (supabaseLink) {
    metadata.supabase = supabaseLink
    await getStripe(c).customers.update(customer.id, { metadata })
  }
  return customer
}

export async function ensureCustomerMetadata(c: Context, customerId: string, orgId: string, userId?: string | null) {
  if (!customerId)
    return
  if (!isStripeConfigured(c))
    return

  const baseConsoleUrl = (getEnv(c, 'WEBAPP_URL') || '').replace(TRAILING_SLASHES_REGEX, '')
  const metadata: Record<string, string> = {
    org_id: orgId,
  }

  if (userId) {
    metadata.user_id = userId
    if (baseConsoleUrl)
      metadata.log_as = `${baseConsoleUrl}/log-as/${userId}`
  }

  const supabaseLink = buildSupabaseDashboardLink(c, customerId)
  if (supabaseLink)
    metadata.supabase = supabaseLink

  try {
    await getStripe(c).customers.update(customerId, { metadata })
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'ensureCustomerMetadata', error })
  }
}

export async function removeOldSubscription(c: Context, subscriptionId: string) {
  if (!isStripeConfigured(c))
    return Promise.resolve()
  cloudlog({ requestId: c.get('requestId'), message: 'removeOldSubscription', id: subscriptionId })
  const deletedSubscription = await getStripe(c).subscriptions.cancel(subscriptionId)
  return deletedSubscription
}
