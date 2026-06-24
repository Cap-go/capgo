import type { FC } from 'react'
import type { Platform } from '../types.js'
import type { PlatformPickerLayout } from './frame-fit.js'
// src/build/onboarding/ui/platform-picker.tsx
//
// The "Which platform do you want to set up?" picker, rendered INSIDE the
// alt-screen wizard (by OnboardingShell). Responsive:
//   • `cards` — bordered cards side-by-side; ←/→ (or 1/2) move the
//     selection, Enter confirms. Used when the terminal has room.
//   • `list` — the same @inkjs/ui Select used everywhere else; used on narrow
//     or short terminals. The layout is chosen by the shell via
//     `pickPlatformLayout` so this component stays pure (props in → JSX out).
//
// `CardChooser` generalizes the cards-vs-list pattern (heading + bordered cards
// driven by ←/→/Enter, or a Select fallback) so other yes/no-style questions —
// e.g. the single-platform "Are you migrating from Appflow?" gate — reuse the
// SAME nice boxes instead of a bare Select.
import { Select } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import React, { useState } from 'react'

// Pure mapping from a keypress to a picker action (extracted so the
// arrow/Enter logic is unit-testable without rendering). ←/h/1 → iOS,
// →/l/2 → Android, Enter → confirm the current selection.
export type PlatformKeyAction
  = | { type: 'select', platform: Platform }
    | { type: 'confirm' }
    | null

export function platformKeyAction(
  input: string,
  key: { leftArrow?: boolean, rightArrow?: boolean, return?: boolean },
): PlatformKeyAction {
  if (key.return)
    return { type: 'confirm' }
  if (key.leftArrow || input === 'h' || input === '1')
    return { type: 'select', platform: 'ios' }
  if (key.rightArrow || input === 'l' || input === '2')
    return { type: 'select', platform: 'android' }
  if (input === 'a' || input === '3')
    return { type: 'select', platform: 'appflow' }
  return null
}

interface PlatformCardProps {
  emoji: string
  name: string
  hint: string
  selected: boolean
}

export const PlatformCard: FC<PlatformCardProps> = ({ emoji, name, hint, selected }) => (
  <Box
    flexDirection="column"
    borderStyle={selected ? 'double' : 'round'}
    borderColor={selected ? 'cyan' : 'gray'}
    paddingX={2}
  >
    <Text bold={selected} color={selected ? 'cyan' : undefined}>{`${emoji}  ${name}`}</Text>
    <Text dimColor>{hint}</Text>
  </Box>
)

export interface PlatformPickerProps {
  layout: PlatformPickerLayout
  onSelect: (platform: Platform) => void
}

export const PlatformPicker: FC<PlatformPickerProps> = ({ layout, onSelect }) => {
  const [selected, setSelected] = useState<Platform>('ios')

  // Arrow/Enter driving for the cards layout. In list layout the @inkjs/ui
  // Select owns input, so this handler no-ops (it stays registered to satisfy
  // the rules of hooks, but ignores keys).
  useInput((input, key) => {
    if (layout !== 'cards')
      return
    const action = platformKeyAction(input, key)
    if (!action)
      return
    if (action.type === 'select')
      setSelected(action.platform)
    else
      onSelect(selected)
  })

  if (layout === 'list') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Which platform do you want to set up?</Text>
        <Select
          options={[
            { label: '🍎  iOS', value: 'ios' },
            { label: '🤖  Android', value: 'android' },
            { label: '🔄  Both, I\'m migrating from Ionic Appflow', value: 'appflow' },
          ]}
          onChange={value => onSelect(value as Platform)}
        />
      </Box>
    )
  }

  // `alignItems="center"` centers the heading and cards horizontally within the
  // full terminal width (the shell renders this in a full-width column).
  // `flexGrow={1}` makes the picker fill the frame, and the flex spacer pushes
  // the key legend to the BOTTOM — the heading + cards sit at the top, the hint
  // sits at the bottom (it's not tied to the buttons).
  return (
    <Box flexDirection="column" alignItems="center" flexGrow={1} marginTop={1}>
      <Text bold>Which platform do you want to set up?</Text>
      <Box flexDirection="row" gap={3} marginTop={1}>
        <PlatformCard emoji="🍎" name="iOS" hint="Apple App Store" selected={selected === 'ios'} />
        <PlatformCard emoji="🤖" name="Android" hint="Google Play" selected={selected === 'android'} />
        <PlatformCard emoji="🔄" name="Appflow" hint="Migrate from Ionic Appflow" selected={selected === 'appflow'} />
      </Box>
      <Box flexGrow={1} />
      <Text dimColor>←  →  choose   ·   a  Appflow   ·   Enter  confirm</Text>
    </Box>
  )
}

// ── generic card chooser ─────────────────────────────────────────────────────
export interface CardChoice {
  value: string
  emoji: string
  name: string
  hint: string
}

// Pure keypress → action mapping for CardChooser (unit-testable). ←/h → previous,
// →/l → next, a number 1..count → that card, Enter → confirm.
export type CardKeyAction
  = | { type: 'move', delta: number }
    | { type: 'jump', index: number }
    | { type: 'confirm' }
    | null

export function cardKeyAction(
  input: string,
  key: { leftArrow?: boolean, rightArrow?: boolean, return?: boolean },
  count: number,
): CardKeyAction {
  if (key.return)
    return { type: 'confirm' }
  if (key.leftArrow || input === 'h')
    return { type: 'move', delta: -1 }
  if (key.rightArrow || input === 'l')
    return { type: 'move', delta: 1 }
  const n = Number.parseInt(input, 10)
  if (!Number.isNaN(n) && n >= 1 && n <= count)
    return { type: 'jump', index: n - 1 }
  return null
}

export interface CardChooserProps {
  layout: PlatformPickerLayout
  question: string
  subtitle?: string
  options: CardChoice[]
  onSelect: (value: string) => void
}

/** A heading + bordered cards (←/→/Enter) — or a Select on narrow terminals —
 *  for any small choice. Reuses PlatformCard so the boxes match the platform picker. */
export const CardChooser: FC<CardChooserProps> = ({ layout, question, subtitle, options, onSelect }) => {
  const [index, setIndex] = useState(0)

  useInput((input, key) => {
    if (layout !== 'cards' || options.length === 0)
      return
    const action = cardKeyAction(input, key, options.length)
    if (!action)
      return
    if (action.type === 'confirm')
      onSelect((options[index] ?? options[0]).value)
    else if (action.type === 'jump')
      setIndex(action.index)
    else
      setIndex(i => (i + action.delta + options.length) % options.length)
  })

  if (layout === 'list') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>{question}</Text>
        {subtitle ? <Text dimColor>{subtitle}</Text> : null}
        <Box marginTop={1}>
          <Select
            options={options.map(o => ({ label: `${o.emoji}  ${o.name} — ${o.hint}`, value: o.value }))}
            onChange={onSelect}
          />
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" alignItems="center" flexGrow={1} marginTop={1}>
      <Text bold>{question}</Text>
      {subtitle ? <Box marginTop={1}><Text dimColor>{subtitle}</Text></Box> : null}
      <Box flexDirection="row" gap={3} marginTop={1}>
        {options.map((o, i) => (
          <PlatformCard key={o.value} emoji={o.emoji} name={o.name} hint={o.hint} selected={index === i} />
        ))}
      </Box>
      <Box flexGrow={1} />
      <Text dimColor>←  →  choose   ·   Enter  confirm</Text>
    </Box>
  )
}
