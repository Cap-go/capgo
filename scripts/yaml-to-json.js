#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

const lang = 'zh-cn'
try {
  const yamlContent = readFileSync(join(process.cwd(), 'locales', `${lang}.yml`), 'utf8')
  const yamlData = load(yamlContent, {
    strict: true,
    lineWidth: -1,
  })

  if (!yamlData) {
    throw new Error('YAML data is empty')
  }

  // Security: Validate YAML structure before processing
  if (typeof yamlData !== 'object' || yamlData === null) {
    throw new Error('YAML data is not an object')
  }

  const newJsonData = {
    $schema: 'https://json-schema.org/draft/2020/schema',
    ...yamlData,
  }

  // Security: Validate JSON structure before writing
  JSON.stringify(newJsonData)

  writeFileSync(
    join(process.cwd(), 'locales', `${lang}.json`),
    JSON.stringify(newJsonData, null, 2),
    'utf8',
  )

  console.log(`Successfully converted ${lang}.yml to ${lang}.json`)
} catch (error) {
  console.error('Error converting YAML to JSON:', error)
  process.exit(1)
}