import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { exit } from 'process';
import { parse } from 'dotenv';

// Check if the environment file name is provided as a command-line argument
const envFileName = process.argv[2];
const envName = process.argv[3];
if (!envFileName) {
  console.error('Please provide the environment file name as the second parameter.');
  exit(1);
}
if (!envName) {
  console.error('Please provide the worker name as the third parameter.');
  exit(1);
}

// Resolve and check the existence of the .env file
const envFilePath = resolve(envFileName);
if (!existsSync(envFilePath)) {
  console.error(`Failed to read the environment file at ${envFilePath}.`);
  exit(1);
}

let envContent;
try {
  envContent = readFileSync(envFilePath, 'utf8');
} catch (error) {
  console.error(`Failed to read the environment file at ${envFilePath}:`, error);
  exit(1);
}

// Use dotenv.parse to convert the file content into an object
const customEnv = parse(envContent);

console.log('Environment file:', envFileName);
console.log('Worker Name:', envName);
console.log('Environment variables', customEnv);


// Convert the environment variables to a JSON string
const secrets = JSON.stringify(customEnv, null, 2);

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
