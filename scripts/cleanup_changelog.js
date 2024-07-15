import { readFileSync, writeFileSync } from 'node:fs'

function cleanChangelog(inputFile, outputFile) {
  try {
    const content = readFileSync(inputFile, 'utf-8')
    const lines = content.split('\n')

    const cleanedLines = []
    const seenEntries = new Set()
    let lastVersionLine = null
    let hasContentSinceLastVersion = false

    for (const line of lines) {
      if (line.trim() === '') {
        continue // Skip empty lines
      }

      if (line.startsWith('## 1.509.0')) {
        break // Stop processing once we hit 1.509.0
      }

      if (line.startsWith('### ') && line.match(/### \d+\.\d+\.\d+ \(\d{4}-\d{2}-\d{2}\)/)) {
        if (lastVersionLine && hasContentSinceLastVersion) {
          cleanedLines.push(lastVersionLine)
        }
        lastVersionLine = line
        hasContentSinceLastVersion = false
      }
      else if (line.startsWith('* ') || line.startsWith('- ')) {
        const entryWithoutPrefix = line.replace(/^[*-] /, '')
        if (!seenEntries.has(entryWithoutPrefix)) {
          if (lastVersionLine) {
            cleanedLines.push(lastVersionLine)
            lastVersionLine = null
          }
          cleanedLines.push(line)
          seenEntries.add(entryWithoutPrefix)
          hasContentSinceLastVersion = true
        }
      }
      else {
        if (lastVersionLine) {
          cleanedLines.push(lastVersionLine)
          lastVersionLine = null
        }
        cleanedLines.push(line)
        hasContentSinceLastVersion = true
      }
    }

    // Handle the last version if it has content
    if (lastVersionLine && hasContentSinceLastVersion) {
      cleanedLines.push(lastVersionLine)
    }

    const cleanedContent = cleanedLines.join('\n')
    writeFileSync(outputFile, cleanedContent)

    console.log('Changelog cleaned successfully!')
  }
  catch (error) {
    console.error('Error cleaning changelog:', error)
  }
}

// Usage
const inputFile = './CHANGELOG_updater.md'
const outputFile = './CHANGELOG_CLEANED_updater.md'
cleanChangelog(inputFile, outputFile)
