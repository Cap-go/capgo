import { createSocialOAuth } from './socialOAuth'

export const googleOAuth = createSocialOAuth('google')

export const startGoogleOAuth = googleOAuth.start
export const captureGoogleOAuthCallback = googleOAuth.capture
export const hasPendingGoogleOAuth = googleOAuth.hasPending
export const completeGoogleOAuth = googleOAuth.complete
export const prepareGoogleOAuthLanding = googleOAuth.prepareLanding
export const consumeGoogleOAuthLandingError = googleOAuth.consumeLandingError
