export function getStripeEmulatorPort(processEnv: NodeJS.ProcessEnv): number {
  const parsedPort = Number.parseInt(processEnv.STRIPE_EMULATOR_PORT ?? '4510', 10)
  if (!Number.isFinite(parsedPort) || parsedPort <= 0)
    throw new Error('STRIPE_EMULATOR_PORT must be a positive integer')
  return parsedPort
}

export function getPlaywrightStripeApiBaseUrl(processEnv: NodeJS.ProcessEnv): string {
  return processEnv.STRIPE_API_BASE_URL || `http://host.docker.internal:${getStripeEmulatorPort(processEnv)}`
}
