export function getStripeEmulatorPort(processEnv: NodeJS.ProcessEnv): number {
  return Number.parseInt(processEnv.STRIPE_EMULATOR_PORT || '4510', 10)
}

export function getPlaywrightStripeApiBaseUrl(processEnv: NodeJS.ProcessEnv): string {
  return processEnv.STRIPE_API_BASE_URL || `http://host.docker.internal:${getStripeEmulatorPort(processEnv)}`
}
