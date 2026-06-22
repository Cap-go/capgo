import type { FC } from 'react'
import type { Platform } from '../types.js'
import type { PlatformPickerLayout } from './frame-fit.js'
// src/build/onboarding/ui/platform-picker.tsx
//
// The "Which platform do you want to set up?" picker, rendered INSIDE the
// alt-screen wizard (by OnboardingShell). Responsive:
//   • `cards` — two bordered cards side-by-side; ←/→ (or 1/2) move the
//     selection, Enter confirms. Used when the terminal has room.
//   • `list` — the same @inkjs/ui Select used everywhere else; used on narrow
//     or short terminals. The layout is chosen by the shell via
//     `pickPlatformLayout` so this component stays pure (props in → JSX out).
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

const PlatformCard: FC<PlatformCardProps> = ({ emoji, name, hint, selected }) => (
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
