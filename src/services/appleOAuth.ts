import { createSocialOAuth } from './socialOAuth'

export const appleOAuth = createSocialOAuth('apple')

export const captureAppleOAuthCallback = appleOAuth.capture
export const hasPendingAppleOAuth = appleOAuth.hasPending
export const completeAppleOAuth = appleOAuth.complete
export const prepareAppleOAuthLanding = appleOAuth.prepareLanding
export const consumeAppleOAuthLandingError = appleOAuth.consumeLandingError
