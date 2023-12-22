// upper is ignored during netlify generation phase
// import from here
let globalEnv = {}

export function setEnv(env: any) {
  globalEnv = env
}

export function getAllEnv() {
  return globalEnv
}

export function getEnv(key: string): string {
  return (globalEnv as any)[key] as string ?? ''
}