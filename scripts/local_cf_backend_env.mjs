import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { argv, exit } from 'node:process'
import { parse } from 'dotenv'

// Check if the environment file name is provided as a command-line argument
const envFileName = argv[2]
const envName = argv[3]
if (!envFileName) {
  console.error('Please provide the environment file name as the second parameter.')
  exit(1)
}
if (!envName) {
  console.error('Please provide the worker name as the third parameter.')
  exit(1)
}

// Resolve and check the existence of the .env file
const envFilePath = resolve(envFileName)
if (!existsSync(envFilePath)) {
  console.error(`Failed to read the environment file at ${envFilePath}.`)
  exit(1)
}

let envContent
try {
  envContent = readFileSync(envFilePath, 'utf8')
}
catch (error) {
  console.error(`Failed to read the environment file at ${envFilePath}:`, error)
  exit(1)
}

// Use dotenv.parse to convert the file content into an object
const customEnv = parse(envContent)

console.log('Environment file:', envFileName)
console.log('Worker Name:', envName)
console.log('Environment variables', customEnv)

// wrangler config file path
const wranglerPath = resolve('./wrangler.toml')

// add variable to wrangler.toml add [vars] section
const wranglerFile = readFileSync(wranglerPath, 'utf8')
const wranglerFileLines = wranglerFile.split('\n')
let varsIndex = wranglerFileLines.findIndex(line => line.includes('[vars]'))
if (varsIndex === -1) {
  wranglerFileLines.push('[vars]')
  varsIndex = wranglerFileLines.length
}
else {
  // Find the index of the next section after [vars]
  let nextSectionIndex = wranglerFileLines.findIndex((line, index) => {
    return index > varsIndex && line.startsWith('[')
  })

  if (nextSectionIndex !== -1) {
    // Remove all lines between [vars] and the next section
    wranglerFileLines.splice(varsIndex + 1, nextSectionIndex - varsIndex - 1)
  }
  else {
    // If no next section, remove everything after [vars]
    wranglerFileLines.splice(varsIndex + 1)
  }
}

for (const key in customEnv) {
  // if json string value, escape double quotes
  if (typeof customEnv[key] === 'string') {
    customEnv[key] = customEnv[key].replace(/"/g, '\\"')
  }
  wranglerFileLines.splice(varsIndex + 1, 0, `${key} = "${customEnv[key]}"`)
  varsIndex++ // Move the index forward after each insertion
}
const newWranglerFile = wranglerFileLines.join('\n')
// write new wrangler.toml
try {
  writeFileSync(wranglerPath, newWranglerFile)
  console.log('New wrangler.toml file written successfully')
}
catch (error) {
  console.error('Failed to upload secrets:', error)
  exit(1)
}
