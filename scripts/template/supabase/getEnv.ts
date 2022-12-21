// upper is ignored during netlify generation phase
// import from here
export const getEnv = (key: string): string => {
  const val = Deno.env.get(key)
  return val || ''
}
