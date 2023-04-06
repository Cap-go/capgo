// upper is ignored during netlify generation phase
// import from here
export function getEnv(key: string): string {
  const val = process.env[key]
  return val || ''
}
