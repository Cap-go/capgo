export type ABTestAudience = 'all' | 'self_signup'
export type ABTestBranch = 'A' | 'B' | 'C' | 'D'
export const AB_TEST_INTENTS = ['ota', 'builder', 'both', 'exploring', 'publish'] as const
export type ABTestIntent = typeof AB_TEST_INTENTS[number]

export interface ABTestConfig {
  audience: ABTestAudience
  intents?: ABTestIntent[]
  label: string
  branches: Record<string, { bento_tag: string, label: string }>
  control_branch: ABTestBranch
  treatment_branch: ABTestBranch
  treatment_percentage: number
  treatment_percentage_by_intent?: Partial<Record<ABTestIntent, number>>
  required_assignments?: Record<string, ABTestBranch>
  required_assignments_by_intent?: Partial<Record<ABTestIntent, Record<string, ABTestBranch>>>
  allocation?: 'deterministic'
  assign_control?: boolean
  enroll_new_users_after?: string
}

export interface ABTestAssignment {
  assigned_at: string
  branch: ABTestBranch
}

export type ABTestsConfig = Record<string, ABTestConfig>
export interface AssignmentAudienceUser { created_via_invite: boolean | null, intent?: unknown, id?: string, created_at?: unknown, abtests_enrolled?: unknown }
const AB_TEST_BRANCHES = ['A', 'B', 'C', 'D'] as const

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidConfig(testName?: string): never {
  throw new Error(`Invalid A/B test configuration${testName ? ` for ${testName}` : ''}`)
}

export function isABTestBranch(value: unknown): value is ABTestBranch {
  return typeof value === 'string' && (AB_TEST_BRANCHES as readonly string[]).includes(value)
}

export function isABTestIntent(value: unknown): value is ABTestIntent {
  return typeof value === 'string' && (AB_TEST_INTENTS as readonly string[]).includes(value)
}

export function validateABTestsConfig(value: unknown): ABTestsConfig {
  if (!isRecord(value))
    invalidConfig()

  const config: ABTestsConfig = {}
  const bentoTags = new Set<string>()
  for (const [testName, entry] of Object.entries(value)) {
    if (!testName.trim() || !isRecord(entry))
      invalidConfig(testName)

    const audience = entry.audience
    const label = entry.label
    const percentage = entry.treatment_percentage
    const treatmentBranch = entry.treatment_branch
    const controlBranch = entry.control_branch
    const branches = entry.branches
    const intents = entry.intents
    if ((audience !== 'all' && audience !== 'self_signup')
      || typeof label !== 'string'
      || !label.trim()
      || typeof percentage !== 'number'
      || !Number.isInteger(percentage)
      || percentage < 0
      || percentage > 100
      || !isRecord(branches)
      || !isABTestBranch(treatmentBranch)
      || !isABTestBranch(controlBranch)
      || treatmentBranch === controlBranch
      || Object.keys(branches).length !== 2
      || !isRecord(branches[treatmentBranch])
      || !isRecord(branches[controlBranch])) {
      invalidConfig(testName)
    }
    if (intents !== undefined
      && (!Array.isArray(intents)
        || intents.length === 0
        || !intents.every(isABTestIntent)
        || new Set(intents).size !== intents.length)) {
      invalidConfig(testName)
    }

    const treatmentTag = branches[treatmentBranch].bento_tag
    const controlTag = branches[controlBranch].bento_tag
    const treatmentLabel = branches[treatmentBranch].label
    const controlLabel = branches[controlBranch].label
    if (typeof treatmentTag !== 'string'
      || typeof controlTag !== 'string'
      || typeof treatmentLabel !== 'string'
      || typeof controlLabel !== 'string'
      || !treatmentTag.trim()
      || !controlTag.trim()
      || !treatmentLabel.trim()
      || !controlLabel.trim()
      || treatmentTag === controlTag
      || bentoTags.has(treatmentTag)
      || bentoTags.has(controlTag)) {
      invalidConfig(testName)
    }
    bentoTags.add(treatmentTag)
    bentoTags.add(controlTag)

    const byIntent = entry.treatment_percentage_by_intent
    if (byIntent !== undefined && (!isRecord(byIntent) || Object.entries(byIntent).some(([intent, amount]) => !isABTestIntent(intent) || !validPercentage(amount))))
      invalidConfig(testName)
    const requirements = entry.required_assignments
    const requirementsByIntent = entry.required_assignments_by_intent
    if (requirements !== undefined && !validRequirements(requirements))
      invalidConfig(testName)
    if (requirementsByIntent !== undefined && (!isRecord(requirementsByIntent) || Object.entries(requirementsByIntent).some(([intent, required]) => !isABTestIntent(intent) || !validRequirements(required))))
      invalidConfig(testName)
    if (isRecord(requirementsByIntent) && Object.values(requirementsByIntent).some(required =>
      Object.entries(required as Record<string, ABTestBranch>).some(([name, branch]) => requirements?.[name] !== undefined && requirements[name] !== branch))) {
      invalidConfig(testName)
    }
    if ((entry.allocation !== undefined && entry.allocation !== 'deterministic')
      || (entry.assign_control !== undefined && typeof entry.assign_control !== 'boolean')
      || (entry.enroll_new_users_after !== undefined && (typeof entry.enroll_new_users_after !== 'string' || !Number.isFinite(Date.parse(entry.enroll_new_users_after))))) {
      invalidConfig(testName)
    }
    // Omitted controls must never be re-randomized on the next lookup.
    if (entry.assign_control === false && entry.allocation !== 'deterministic')
      invalidConfig(testName)

    config[testName] = {
      audience,
      ...(byIntent === undefined ? {} : { treatment_percentage_by_intent: { ...byIntent } }),
      ...(requirements === undefined ? {} : { required_assignments: { ...requirements } }),
      ...(requirementsByIntent === undefined ? {} : { required_assignments_by_intent: structuredClone(requirementsByIntent) }),
      ...(entry.allocation === undefined ? {} : { allocation: entry.allocation }),
      ...(entry.assign_control === undefined ? {} : { assign_control: entry.assign_control }),
      ...(entry.enroll_new_users_after === undefined ? {} : { enroll_new_users_after: entry.enroll_new_users_after }),
      label: label.trim(),
      ...(intents === undefined ? {} : { intents: [...intents] }),
      control_branch: controlBranch,
      treatment_branch: treatmentBranch,
      treatment_percentage: percentage,
      branches: {
        [treatmentBranch]: { bento_tag: treatmentTag, label: treatmentLabel.trim() },
        [controlBranch]: { bento_tag: controlTag, label: controlLabel.trim() },
      },
    }
  }

  orderedTestNames(config)
  return config
}

function validPercentage(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
}

function validRequirements(value: unknown): value is Record<string, ABTestBranch> {
  return isRecord(value) && Object.values(value).every(isABTestBranch)
}

function orderedTestNames(config: ABTestsConfig) {
  const ordered: string[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  function visit(name: string) {
    if (visiting.has(name))
      invalidConfig(name)
    if (visited.has(name))
      return
    visiting.add(name)
    const test = config[name]
    if (!test)
      invalidConfig(name)
    const requirements = [test.required_assignments, ...Object.values(test.required_assignments_by_intent ?? {})]
    const dependencies = requirements.flatMap(required => Object.entries(required ?? {}))
      .sort(([left], [right]) => left.localeCompare(right))
    for (const [dependency, branch] of dependencies) {
      if (!config[dependency]?.branches?.[branch])
        invalidConfig(name)
      visit(dependency)
    }
    visiting.delete(name)
    visited.add(name)
    ordered.push(name)
  }
  for (const name of Object.keys(config).sort())
    visit(name)
  return ordered
}

export function isProspectiveUser(createdAt: unknown, cutoff: string) {
  const timestamp = createdAt instanceof Date ? createdAt.getTime() : typeof createdAt === 'string' ? Date.parse(createdAt) : Number.NaN
  return timestamp >= Date.parse(cutoff)
}

export function isEligibleForTest(user: AssignmentAudienceUser, test: ABTestConfig, testName?: string) {
  if (test.audience === 'self_signup' && user.created_via_invite)
    return false
  if (test.enroll_new_users_after !== undefined
    && (!Array.isArray(user.abtests_enrolled) || !user.abtests_enrolled.includes(testName)
      || !isProspectiveUser(user.created_at, test.enroll_new_users_after))) {
    return false
  }
  if ((test.treatment_percentage_by_intent !== undefined || test.required_assignments_by_intent !== undefined) && !isABTestIntent(user.intent))
    return false
  return test.intents === undefined
    || (isABTestIntent(user.intent) && test.intents.includes(user.intent))
}

function requirementsMatch(user: AssignmentAudienceUser, test: ABTestConfig, assignments: Record<string, ABTestAssignment>) {
  const requirements = {
    ...test.required_assignments,
    ...(isABTestIntent(user.intent) ? test.required_assignments_by_intent?.[user.intent] : {}),
  }
  return Object.entries(requirements).every(([name, branch]) => assignments[name]?.branch === branch)
}

// Stable per user + experiment; independent of retries, intent and JSON ordering.
function allocationFraction(userId: string, testName: string) {
  let hash = 2166136261
  for (const character of `${testName}:${userId}`) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

export function resolveABTestAssignments(
  user: AssignmentAudienceUser,
  stored: unknown,
  config: ABTestsConfig,
  random = Math.random,
  now = () => new Date(),
  allowNewAssignments = true,
) {
  const nextAssignments = isRecord(stored) ? { ...stored } : {}
  const assignments: Record<string, ABTestAssignment> = {}
  let assignedAt: string | undefined
  for (const name of orderedTestNames(config)) {
    const test = config[name]
    const existing = nextAssignments[name]
    if (!isEligibleForTest(user, test, name) || !requirementsMatch(user, test, assignments)) {
      delete nextAssignments[name]
      continue
    }
    const percentage = (isABTestIntent(user.intent) ? test.treatment_percentage_by_intent?.[user.intent] : undefined) ?? test.treatment_percentage
    if (test.assign_control === false && test.allocation === 'deterministic'
      && (!user.id || allocationFraction(user.id, name) * 100 >= percentage)) {
      delete nextAssignments[name]
      continue
    }
    if (existing !== undefined) {
      if (!isRecord(existing) || typeof existing.assigned_at !== 'string' || !isABTestBranch(existing.branch)
        || !test.branches[existing.branch]) {
        throw new Error('A/B test assignment failed')
      }
      if (test.assign_control === false && existing.branch === test.control_branch) {
        delete nextAssignments[name]
        continue
      }
      assignments[name] = { assigned_at: existing.assigned_at, branch: existing.branch }
      continue
    }
    if (!allowNewAssignments || percentage === 0 || (test.allocation === 'deterministic' && !user.id))
      continue
    const fraction = test.allocation === 'deterministic' ? allocationFraction(user.id!, name) : random()
    const branch = fraction * 100 < percentage ? test.treatment_branch : test.control_branch
    if (test.assign_control === false && branch === test.control_branch)
      continue
    assignedAt ??= now().toISOString()
    assignments[name] = { assigned_at: assignedAt, branch }
    nextAssignments[name] = assignments[name]
  }
  const changed = JSON.stringify(nextAssignments) !== JSON.stringify(isRecord(stored) ? stored : {})
  return { assignments, nextAssignments, changed }
}

export function createABTestAssignments(
  user: AssignmentAudienceUser,
  config: ABTestsConfig,
  random = Math.random,
  now = () => new Date(),
): Record<string, ABTestAssignment> {
  return resolveABTestAssignments(user, {}, config, random, now).assignments
}
