import type { Command, Option } from 'commander'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { log } from '@clack/prompts'
import { program } from 'commander'
import { formatError } from './utils'

// Define proper types for mapped commands
interface CommandOption {
  flags: string
  description: string
}

// Extend Command type to include internal properties
interface CommandWithInternals extends Command {
  _actionHandler: ((...args: any[]) => void) | null
}

interface MappedCommand {
  name: string
  alias: string
  description: string
  options: CommandOption[]
  subcommands: MappedCommand[]
  hasAction: boolean // Property to track if command has an action handler
  isCommandGroup: boolean // Property to identify command groups
}

function formatFrontmatterString(value: string): string {
  return JSON.stringify(value)
}

// Helper function to get an emoji for a command
function getCommandEmoji(cmdName: string): string {
  let emoji = '🔹'
  if (cmdName.includes('upload'))
    emoji = '⬆️'
  else if (cmdName.includes('delete'))
    emoji = '🗑️'
  else if (cmdName.includes('list'))
    emoji = '📋'
  else if (cmdName.includes('add'))
    emoji = '➕'
  else if (cmdName.includes('set'))
    emoji = '⚙️'
  else if (cmdName.includes('create'))
    emoji = '🔨'
  else if (cmdName.includes('encrypt'))
    emoji = '🔒'
  else if (cmdName.includes('decrypt'))
    emoji = '🔓'
  else if (cmdName.includes('debug'))
    emoji = '🐞'
  else if (cmdName === 'run')
    emoji = '📱'
  else if (cmdName.includes('doctor'))
    emoji = '👨‍⚕️'
  else if (cmdName.includes('login'))
    emoji = '🔑'
  else if (cmdName.includes('init'))
    emoji = '🚀'
  else if (cmdName.includes('compatibility'))
    emoji = '🧪'
  else if (cmdName.includes('cleanup'))
    emoji = '🧹'
  else if (cmdName.includes('currentBundle'))
    emoji = '📦'
  else if (cmdName.includes('setting'))
    emoji = '⚙️'
  else if (cmdName === 'app')
    emoji = '📱'
  else if (cmdName === 'bundle')
    emoji = '📦'
  else if (cmdName === 'channel')
    emoji = '📢'
  else if (cmdName === 'key')
    emoji = '🔐'
  else if (cmdName === 'account')
    emoji = '👤'
  return emoji
}

export function generateDocs(filePath: string = './README.md', folderPath?: string) {
  const commands = program.commands.map((cmd: Command): MappedCommand => {
    // Cast to access internal properties
    const cmdWithInternals = cmd as CommandWithInternals
    // Check if command has an action handler
    const hasAction = cmdWithInternals._actionHandler !== null && cmdWithInternals._actionHandler !== undefined
    // Check if it has subcommands
    const hasSubcommands = cmd.commands && cmd.commands.length > 0
    // A command group has subcommands but no action handler
    const isCommandGroup = hasSubcommands && !hasAction

    return {
      name: cmd.name(),
      alias: cmd.alias() || '',
      description: cmd.description(),
      options: cmd.options.map((opt: Option): CommandOption => ({
        flags: opt.flags,
        description: opt.description || '',
      })),
      subcommands: cmd.commands
        ? cmd.commands.map((subCmd: Command): MappedCommand => {
            const subCmdWithInternals = subCmd as CommandWithInternals
            const subCmdHasAction = subCmdWithInternals._actionHandler !== null && subCmdWithInternals._actionHandler !== undefined
            return {
              name: subCmd.name(),
              alias: subCmd.alias() || '',
              description: subCmd.description(),
              options: subCmd.options.map((opt: Option): CommandOption => ({
                flags: opt.flags,
                description: opt.description || '',
              })),
              subcommands: [], // Subcommands don't have their own subcommands in this implementation
              hasAction: subCmdHasAction,
              isCommandGroup: false, // Subcommands are never command groups
            }
          })
        : [],
      hasAction,
      isCommandGroup,
    }
  })

  // Function to format command documentation
  const formatCommand = (cmd: MappedCommand, isSubcommand = false, parentCmd?: string, skipMainHeading = false) => {
    const cmdName = cmd.name
    const cmdNameCapitalized = cmdName.charAt(0).toUpperCase() + cmdName.slice(1)

    // Create anchor for TOC linking - use different IDs for README vs individual files
    let anchor
    if (isSubcommand) {
      // For subcommands, in README we use parent-child format, in individual files just child
      anchor = parentCmd ? `${parentCmd}-${cmdName}` : cmdName
    }
    else {
      // For main commands, in README we use command name, in individual files we use 'options'
      anchor = skipMainHeading ? 'options' : cmdName
    }

    const heading = isSubcommand ? `###` : `##`

    let section = ''

    // Command heading with emoji based on command type
    const emoji = getCommandEmoji(cmdName)

    // For all commands, add the heading and description
    if (!(skipMainHeading && !isSubcommand)) {
      section += `${heading} <a id="${anchor}"></a> ${emoji} **${cmdNameCapitalized}**\n\n`
    }

    if (cmd.alias) {
      section += `**Alias:** \`${cmd.alias}\`\n\n`
    }

    // For regular commands, show usage example
    if (!cmd.isCommandGroup) {
      section += `\`\`\`bash\n`
      if (isSubcommand) {
        section += `npx @capgo/cli@latest ${parentCmd} ${cmdName}\n`
      }
      else {
        section += `npx @capgo/cli@latest ${cmdName}\n`
      }
      section += `\`\`\`\n\n`
    }

    // Description - split by line breaks and handle topics
    const descLines = cmd.description.split('\n')
    // Skip the first line for the main command since we already included it
    const startIndex = (!isSubcommand && skipMainHeading) ? 1 : 0

    for (let i = startIndex; i < descLines.length; i++) {
      const line = descLines[i]
      if (line.trim().startsWith('Note:')) {
        // Format notes with emoji
        section += `> ℹ️ ${line.trim().substring(5).trim()}\n\n`
      }
      else if (line.includes('Example:')) {
        // Skip example lines, they'll be handled separately
      }
      else if (line.trim()) { // Only add non-empty lines
        section += `${line}\n`
      }
    }
    section += '\n'

    // Handle example separately - only for regular commands, not for command groups
    const exampleLine = cmd.description.split('\n').find((line: string) => line.includes('Example:'))
    if (exampleLine && !cmd.isCommandGroup) {
      section += `**Example:**\n\n`
      section += `\`\`\`bash\n`
      section += `${exampleLine.replace('Example: ', '')}\n`
      section += `\`\`\`\n\n`
    }

    // Options table - for all commands (even command groups may have global options)
    if (cmd.options.length > 0) {
      if (!isSubcommand) {
        const optionsAnchor = skipMainHeading ? 'options' : `${cmdName}-options`
        const optionsHeading = skipMainHeading ? '##' : '###'
        // In README each command is already a top-level section, so options sit underneath it.
        section += `${optionsHeading} <a id="${optionsAnchor}"></a> Options\n\n`
      }
      else {
        section += `**Options:**\n\n`
      }
      section += `| Param          | Type          | Description          |\n`
      section += `| -------------- | ------------- | -------------------- |\n`
      for (const opt of cmd.options) {
        const param = opt.flags.split(' ')[0]
        const type = opt.flags.split(' ').length > 1 ? 'string' : 'boolean'
        section += `| **${param}** | <code>${type}</code> | ${opt.description} |\n`
      }
      section += '\n'
    }

    return section
  }

  // If folderPath is provided, generate individual files for each command
  if (folderPath) {
    // Create the directory if it doesn't exist
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true })
    }

    // Process each command
    for (const cmd of commands) {
      if (cmd.name === 'generate-docs')
        return // Skip documenting this command

      // Determine emoji for this command
      const emoji = getCommandEmoji(cmd.name)

      // Generate frontmatter and content for the command
      let cmdFile = `---
title: ${emoji} ${cmd.name}
description: ${formatFrontmatterString(cmd.description.split('\n')[0])}
sidebar_label: ${cmd.name}
sidebar:
  order: ${commands.indexOf(cmd) + 1}
---

`
      // Add command description with emoji preserved, but skip the redundant title
      const description = cmd.description.split('\n')[0]
      cmdFile += `${description}\n\n`

      let cmdMarkdown = ''
      if (cmd.subcommands.length === 0) {
        // Add command documentation
        cmdMarkdown = formatCommand(cmd, false, cmd.name, true) // Last param to skip the main heading
      }
      else {
        for (const subCmd of cmd.subcommands) {
          cmdMarkdown += formatCommand(subCmd, true, cmd.name)
        }
      }

      cmdFile += cmdMarkdown

      // Write the file
      try {
        writeFileSync(`${folderPath}/${cmd.name}.mdx`, cmdFile, 'utf8')
        log.success(`Generated documentation file for ${cmd.name} command in ${folderPath}/${cmd.name}.mdx`)
      }
      catch (error) {
        log.error(`Error generating file for ${cmd.name}: ${formatError(error)}`)
      }
    }
    log.success(`Documentation files generated in ${folderPath}/`)
  }
  else {
    // Generate combined markdown for README
    let markdown = '## 📑 Capgo CLI Commands\n\n'

    // Generate Table of Contents
    markdown += '## 📋 Table of Contents\n\n'
    for (const cmd of commands) {
      if (cmd.name === 'generate-docs')
        continue // Skip documenting this command

      // Get emoji for this command
      const emoji = getCommandEmoji(cmd.name)
      markdown += `- ${emoji} [${cmd.name.charAt(0).toUpperCase() + cmd.name.slice(1)}](#${cmd.name})\n`

      if (cmd.subcommands.length > 0) {
        for (const subCmd of cmd.subcommands) {
          markdown += `  - [${subCmd.name.charAt(0).toUpperCase() + subCmd.name.slice(1)}](#${cmd.name}-${subCmd.name})\n`
        }
      }
    }
    markdown += '\n'

    // Generate documentation for each command
    for (const cmd of commands) {
      if (cmd.name === 'generate-docs')
        continue // Skip documenting this command

      // Use the formatCommand function with the flag set to skip usage for command groups
      markdown += formatCommand(cmd, false, undefined, false)

      if (cmd.subcommands.length > 0) {
        // For command groups, don't add a subcommands heading since that's implied
        if (!cmd.isCommandGroup) {
          markdown += `#### ${cmd.name.toUpperCase()} Subcommands:\n\n`
        }

        for (const subCmd of cmd.subcommands) {
          markdown += formatCommand(subCmd, true, cmd.name)
        }
      }

      markdown += '\n'
    }

    // Update README.md or write to the specified file
    const startTag = '<!-- AUTO-GENERATED-DOCS-START -->'
    const endTag = '<!-- AUTO-GENERATED-DOCS-END -->'
    let fileContent = ''
    try {
      fileContent = readFileSync(filePath, 'utf8')
    }
    catch {
      fileContent = ''
    }

    const startIndex = fileContent.indexOf(startTag)
    const endIndex = fileContent.indexOf(endTag, startIndex)

    if (startIndex !== -1 && endIndex !== -1) {
      const before = fileContent.substring(0, startIndex + startTag.length)
      const after = fileContent.substring(endIndex)
      const newContent = `${before}\n${markdown}\n${after}`
      writeFileSync(filePath, newContent, 'utf8')
      log.success(`Documentation updated in ${filePath}`)
    }
    else {
      writeFileSync(filePath, markdown, 'utf8')
      log.success(`Documentation written to ${filePath}`)
    }
  }
}
