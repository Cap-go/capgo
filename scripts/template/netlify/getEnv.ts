// upper is ignored during netlify generation phase
// import from here
export const getEnv = (key: string): string => {
  const val = process.env[key]
  return val || ''
}
