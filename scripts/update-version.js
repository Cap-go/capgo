#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

// Get version from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const version = packageJson.version

// Update version.ts file
const versionFilePath = path.join('supabase', 'functions', '_backend', 'utils', 'version.ts')
const versionFileContent = `export const version = '${version}'\n`

fs.writeFileSync(versionFilePath, versionFileContent)
console.log(`Updated version.ts with version ${version}`) 
