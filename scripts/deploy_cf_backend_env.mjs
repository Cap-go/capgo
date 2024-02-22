import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { exit } from 'process';

// Check if the environment file name is provided as a command-line argument
const envFileName = process.argv[2];
const envName = process.argv[3];
if (!envFileName) {
  console.error('Please provide the environment file name as second parameter.');
  exit(1);
}
if (!envName) {
  console.error('Please provide the worker name as third parameter.');
  exit(1);
}

// Read the environment file
const envFilePath = resolve(envFileName);
let env;
try {
  env = readFileSync(envFilePath, 'utf8');
} catch (error) {
  console.error(`Failed to read the environment file at ${envFilePath}:`, error);
  exit(1);
}

const envVars = env.split('\n').filter((line) => line.trim() !== '').filter((line) => !line.startsWith('#'));

console.log('Environment file', envFileName);
console.log('worker Name', envName);
console.log('Environment variables', envVars);

const envJson = envVars.reduce((acc, envVar) => {
  const [key, value] = envVar.split('=');
  acc[key] = value;
  return acc;
}, {});

// Convert the environment variables to JSON string
const secrets = JSON.stringify(envJson, null, 2);
console.log('Secrets', secrets);

// Construct the command to execute
const command = `echo '${secrets.replace(/'/g, "'\\''")}' | wrangler secret:bulk --name ${envName}`;

try {
  // Execute the command
  const output = execSync(command, { stdio: 'inherit' });
  console.log('Secrets uploaded successfully');
} catch (error) {
  console.error('Failed to upload secrets:', error);
  exit(1);
}
