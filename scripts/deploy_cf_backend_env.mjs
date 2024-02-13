import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { exit } from 'process';

const env = readFileSync(resolve('.env'), 'utf8');
const envVars = env.split('\n').filter((line) => line.trim() !== '').filter((line) => !line.startsWith('#'));

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
const command = `echo '${secrets}' | wrangler secret:bulk`;

try {
  // Execute the command
  const output = execSync(command, { stdio: 'inherit' });
  console.log('Secrets uploaded successfully');
} catch (error) {
  console.error('Failed to upload secrets:', error);
  exit(1);
}
