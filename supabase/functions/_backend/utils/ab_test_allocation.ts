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
const RESERVED_TEST_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidConfig(testName?: string): never {
  const suffix = testName ? ` for ${testName}` : ''
  throw new Error(`Invalid A/B test configuration${suffix}`)
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
    config[testName] = parseABTestConfig(testName, entry, bentoTags)
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

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

function parseBranch(value: unknown, testName: string, bentoTags: Set<string>) {
  if (!isRecord(value) || !nonemptyString(value.bento_tag) || !nonemptyString(value.label)
    || bentoTags.has(value.bento_tag)) {
    invalidConfig(testName)
  }
  bentoTags.add(value.bento_tag)
  return { bento_tag: value.bento_tag, label: value.label.trim() }
}

function parseABTestCore(entry: Record<string, unknown>, testName: string, bentoTags: Set<string>): ABTestConfig {
  const { audience, label, treatment_percentage: percentage, treatment_branch: treatmentBranch, control_branch: controlBranch, branches } = entry
  if ((audience !== 'all' && audience !== 'self_signup') || !nonemptyString(label) || !validPercentage(percentage)
    || !isABTestBranch(treatmentBranch) || !isABTestBranch(controlBranch) || treatmentBranch === controlBranch
    || !isRecord(branches) || Object.keys(branches).length !== 2) {
    invalidConfig(testName)
  }
  return {
    audience,
    label: label.trim(),
    control_branch: controlBranch,
    treatment_branch: treatmentBranch,
    treatment_percentage: percentage,
    branches: {
      [treatmentBranch]: parseBranch(branches[treatmentBranch], testName, bentoTags),
      [controlBranch]: parseBranch(branches[controlBranch], testName, bentoTags),
    },
  }
}

function parseIntents(value: unknown, testName: string): ABTestIntent[] | undefined {
  if (value === undefined)
    return undefined
  if (!Array.isArray(value) || value.length === 0 || !value.every(isABTestIntent) || new Set(value).size !== value.length)
    invalidConfig(testName)
  return [...value]
}

function parseIntentOptions<T>(value: unknown, isValid: (option: unknown) => option is T, testName: string): Partial<Record<ABTestIntent, T>> | undefined {
  if (value === undefined)
    return undefined
  if (!isRecord(value) || Object.entries(value).some(([intent, option]) => !isABTestIntent(intent) || !isValid(option)))
    invalidConfig(testName)
  return structuredClone(value) as Partial<Record<ABTestIntent, T>>
}

function parseRequirements(value: unknown, testName: string) {
  if (value === undefined)
    return undefined
  if (!validRequirements(value))
    invalidConfig(testName)
  return { ...value }
}

function validateRequirementCompatibility(
  requirements: ABTestConfig['required_assignments'],
  requirementsByIntent: ABTestConfig['required_assignments_by_intent'],
  testName: string,
) {
  for (const required of Object.values(requirementsByIntent ?? {})) {
    if (Object.entries(required).some(([name, branch]) => requirements?.[name] !== undefined && requirements[name] !== branch))
      invalidConfig(testName)
  }
}

function parseAllocationOptions(entry: Record<string, unknown>, testName: string): Pick<ABTestConfig, 'allocation' | 'assign_control' | 'enroll_new_users_after'> {
  const { allocation, assign_control: assignControl, enroll_new_users_after: cutoff } = entry
  if ((allocation !== undefined && allocation !== 'deterministic')
    || (assignControl !== undefined && typeof assignControl !== 'boolean')
    || (cutoff !== undefined && (typeof cutoff !== 'string' || !Number.isFinite(Date.parse(cutoff))))) {
    invalidConfig(testName)
  }
  // Omitted controls must never be re-randomized on the next lookup.
  if (assignControl === false && allocation !== 'deterministic')
    invalidConfig(testName)
  return {
    ...(allocation === undefined ? {} : { allocation }),
    ...(assignControl === undefined ? {} : { assign_control: assignControl }),
    ...(cutoff === undefined ? {} : { enroll_new_users_after: cutoff }),
  }
}

function parseABTestConfig(testName: string, entry: unknown, bentoTags: Set<string>): ABTestConfig {
  if (!testName.trim() || RESERVED_TEST_NAMES.has(testName) || !isRecord(entry))
    invalidConfig(testName)
  const core = parseABTestCore(entry, testName, bentoTags)
  const intents = parseIntents(entry.intents, testName)
  const byIntent = parseIntentOptions(entry.treatment_percentage_by_intent, validPercentage, testName)
  const requirements = parseRequirements(entry.required_assignments, testName)
  const requirementsByIntent = parseIntentOptions(entry.required_assignments_by_intent, validRequirements, testName)
  validateRequirementCompatibility(requirements, requirementsByIntent, testName)
  return {
    ...core,
    ...(byIntent === undefined ? {} : { treatment_percentage_by_intent: byIntent }),
    ...(requirements === undefined ? {} : { required_assignments: requirements }),
    ...(requirementsByIntent === undefined ? {} : { required_assignments_by_intent: requirementsByIntent }),
    ...parseAllocationOptions(entry, testName),
    ...(intents === undefined ? {} : { intents }),
  }
}

function compareTestNames(left: string, right: string) {
  const compared = left.localeCompare(right, 'en')
  if (compared !== 0 || left === right)
    return compared
  return left < right ? -1 : 1
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
      .sort(([left], [right]) => compareTestNames(left, right))
    for (const [dependency, branch] of dependencies) {
      if (!config[dependency]?.branches?.[branch])
        invalidConfig(name)
      visit(dependency)
    }
    visiting.delete(name)
    visited.add(name)
    ordered.push(name)
  }
  for (const name of Object.keys(config).sort(compareTestNames))
    visit(name)
  return ordered
}

export function isProspectiveUser(createdAt: unknown, cutoff: string) {
  let timestamp = Number.NaN
  if (createdAt instanceof Date)
    timestamp = createdAt.getTime()
  else if (typeof createdAt === 'string')
    timestamp = Date.parse(createdAt)
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
    hash ^= character.codePointAt(0)!
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

function treatmentPercentage(user: AssignmentAudienceUser, test: ABTestConfig) {
  const intentPercentage = isABTestIntent(user.intent) ? test.treatment_percentage_by_intent?.[user.intent] : undefined
  return intentPercentage ?? test.treatment_percentage
}

function excludedFromTreatment(user: AssignmentAudienceUser, name: string, test: ABTestConfig, percentage: number) {
  return test.assign_control === false && test.allocation === 'deterministic'
    && (!user.id || allocationFraction(user.id, name) * 100 >= percentage)
}

function readStoredAssignment(existing: unknown, test: ABTestConfig): ABTestAssignment | undefined {
  if (!isRecord(existing) || typeof existing.assigned_at !== 'string' || !isABTestBranch(existing.branch)
    || !test.branches[existing.branch]) {
    return undefined
  }
  return { assigned_at: existing.assigned_at, branch: existing.branch }
}

function mayRetainAssignment(assignment: ABTestAssignment, test: ABTestConfig) {
  return test.assign_control !== false || assignment.branch !== test.control_branch
}

function selectNewBranch(user: AssignmentAudienceUser, name: string, test: ABTestConfig, percentage: number, random: () => number, allowNewAssignments: boolean) {
  if (!allowNewAssignments || percentage === 0 || (test.allocation === 'deterministic' && !user.id))
    return undefined
  const fraction = test.allocation === 'deterministic' ? allocationFraction(user.id!, name) : random()
  const branch = fraction * 100 < percentage ? test.treatment_branch : test.control_branch
  if (test.assign_control === false && branch === test.control_branch)
    return undefined
  return branch
}

export function resolveABTestAssignments(
  user: AssignmentAudienceUser,
  stored: unknown,
  config: ABTestsConfig,
  random = Math.random,
  now = () => new Date(),
  allowNewAssignments = true,
) {
  const storedAssignments = isRecord(stored) ? stored : {}
  const nextAssignments = { ...storedAssignments }
  const assignments: Record<string, ABTestAssignment> = {}
  let assignedAt: string | undefined
  for (const name of orderedTestNames(config)) {
    const test = config[name]
    const existing = readStoredAssignment(nextAssignments[name], test)
    const percentage = treatmentPercentage(user, test)
    if (!isEligibleForTest(user, test, name) || !requirementsMatch(user, test, assignments)
      || excludedFromTreatment(user, name, test, percentage)) {
      delete nextAssignments[name]
      continue
    }
    if (existing !== undefined) {
      if (mayRetainAssignment(existing, test))
        assignments[name] = existing
      else
        delete nextAssignments[name]
      continue
    }
    delete nextAssignments[name]
    const branch = selectNewBranch(user, name, test, percentage, random, allowNewAssignments)
    if (branch === undefined)
      continue
    assignedAt ??= now().toISOString()
    assignments[name] = { assigned_at: assignedAt, branch }
    nextAssignments[name] = assignments[name]
  }
  const changed = JSON.stringify(nextAssignments) !== JSON.stringify(storedAssignments)
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
