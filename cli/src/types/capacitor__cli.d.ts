interface CapacitorCliConfig {
  app: {
    extConfig: import('../schemas/config').CapacitorConfig
    extConfigFilePath: string
  }
}

declare module '@capacitor/cli/dist/config' {
  export function loadConfig(): Promise<CapacitorCliConfig>
  export function writeConfig(extConfig: import('../schemas/config').CapacitorConfig, extConfigFilePath: string): Promise<void>
}

declare module '@capacitor/cli/dist/util/monorepotools' {
  export function findMonorepoRoot(currentPath: string): string
  export function isMonorepo(currentPath: string): boolean
  export function isNXMonorepo(currentPath: string): boolean
  export function findNXMonorepoRoot(currentPath: string): string
}
