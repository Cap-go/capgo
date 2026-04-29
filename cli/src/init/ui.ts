import { clearInitLogs, setInitScreen, setInitSpinner } from './runtime'

export interface InitOnboardingStepDefinition {
  title: string
  summary: string
  phase: string
}

export const initOnboardingSteps: InitOnboardingStepDefinition[] = [
  {
    title: 'Add Your App',
    summary: 'Create the Capgo app for this project, or confirm the one you already use.',
    phase: 'Prepare',
  },
  {
    title: 'Create Production Channel',
    summary: 'Set up the default release channel used for your first OTA validation.',
    phase: 'Prepare',
  },
  {
    title: 'Install Updater Plugin',
    summary: 'Install the updater dependency and configure it for this project.',
    phase: 'Integrate',
  },
  {
    title: 'Add Integration Code',
    summary: 'Inject the app-ready hook so the native app can confirm bundle startup.',
    phase: 'Integrate',
  },
  {
    title: 'Setup Encryption',
    summary: 'Decide whether to enable end-to-end bundle encryption for sensitive apps.',
    phase: 'Integrate',
  },
  {
    title: 'Select Platform',
    summary: 'Choose the device platform you want to use for the guided validation path.',
    phase: 'Integrate',
  },
  {
    title: 'Build Your Project',
    summary: 'Build web assets, sync native sources, and validate the generated app shell.',
    phase: 'Integrate',
  },
  {
    title: 'Run on Device',
    summary: 'Launch the baseline app on a real device or simulator before the OTA test.',
    phase: 'Validate',
  },
  {
    title: 'Make a Test Change',
    summary: 'Create a visible change and prepare the next version for upload.',
    phase: 'Validate',
  },
  {
    title: 'Upload Bundle',
    summary: 'Ship the updated web bundle to Capgo for OTA delivery.',
    phase: 'Validate',
  },
  {
    title: 'Test Update on Device',
    summary: 'Confirm that the installed app receives and applies the OTA update.',
    phase: 'Validate',
  },
  {
    title: 'Completion',
    summary: 'Wrap up onboarding and leave you with the next commands to use.',
    phase: 'Finish',
  },
]

type PanelTone = 'cyan' | 'blue' | 'green' | 'yellow'

function phaseTone(phase: string): PanelTone {
  switch (phase) {
    case 'Prepare':
      return 'blue'
    case 'Integrate':
      return 'cyan'
    case 'Validate':
      return 'green'
    case 'Finish':
      return 'yellow'
    default:
      return 'cyan'
  }
}

function progressPercent(stepNumber: number, totalSteps: number) {
  return Math.round(((stepNumber - 1) / totalSteps) * 100)
}

export function renderInitOnboardingWelcome(totalSteps: number): void {
  clearInitLogs()
  setInitScreen({
    title: 'Capgo OTA Onboarding',
    introLines: [
      `Connect your Capacitor app to Capgo in ${totalSteps} guided steps.`,
      'Guide · https://capgo.app/docs/getting-started/onboarding/',
      'Session · ETA 2-10 min • Resume support automatic',
    ],
    tone: 'cyan',
  })
}

export function renderInitOnboardingFrame(currentStepNumber: number, totalSteps: number, options?: { resumed?: boolean }): void {
  clearInitLogs()
  setInitSpinner()
  const step = initOnboardingSteps[currentStepNumber - 1]
  const nextStep = initOnboardingSteps[currentStepNumber]
  if (!step) {
    setInitScreen({
      title: 'Capgo OTA Onboarding',
      stepLabel: 'Current Step',
      stepSummary: 'Waiting for onboarding step data.',
      tone: 'cyan',
    })
    return
  }

  const completedPercent = progressPercent(currentStepNumber, totalSteps)
  const completedSteps = Math.max(0, currentStepNumber - 1)
  const remainingSteps = Math.max(0, totalSteps - completedSteps)
  const nextLabel = nextStep ? nextStep.title : 'Finish onboarding'

  setInitScreen({
    phaseLabel: step.phase,
    progress: completedPercent,
    stepLabel: `Step ${currentStepNumber}/${totalSteps} · ${step.title}`,
    stepSummary: step.summary,
    roadmapLine: `Next · ${nextLabel}`,
    statusLine: `Progress · ${completedSteps}/${totalSteps} done • ${remainingSteps} left`,
    resumeLine: options?.resumed ? `Continuing from step ${currentStepNumber}/${totalSteps}` : undefined,
    tone: phaseTone(step.phase),
  })
}

export function renderInitOnboardingComplete(appId: string, nextUploadCommand: string, debugCommand: string): void {
  clearInitLogs()
  setInitScreen({
    title: 'Onboarding Complete',
    completionLines: [
      `${appId} is now wired for Capgo OTA updates.`,
      `Next upload · ${nextUploadCommand}`,
      'Important · Avoid running cap sync again until the OTA path is validated on-device.',
      `Debug · ${debugCommand}`,
    ],
    tone: 'green',
  })
}

export function formatInitResumeMessage(stepDone: number, totalSteps: number): string {
  const safeStepDone = Math.min(Math.max(stepDone, 0), totalSteps)
  const nextStep = initOnboardingSteps[safeStepDone]
  const label = nextStep ? ` · next: ${nextStep.title}` : ''
  return `Resume point detected: ${safeStepDone}/${totalSteps}${label}`
}
