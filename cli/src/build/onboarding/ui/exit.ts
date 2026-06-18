export type OnboardingBeforeExit = () => Promise<void> | void

export function exitAfterOnboardingBeforeExit(onBeforeExit: OnboardingBeforeExit | undefined, exit: () => void): void {
  void Promise.resolve()
    .then(() => onBeforeExit?.())
    .finally(exit)
}
