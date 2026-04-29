// CapacitorConfig

declare module '@capacitor/cli/dist/config' {
  export function loadConfig(): CapacitorConfig
  export function writeConfig(extConfig: CapacitorConfig, extConfigFilePath: string): void
};

declare module '@capacitor/cli/dist/util/monorepotools' {
  export function findMonorepoRoot(currentPath: string): string
  // isMonorepo
  export function isMonorepo(currentPath: string): boolean
  // isNXMonorepo
  export function isNXMonorepo(currentPath: string): boolean
  // findNXMonorepoRoot
  export function findNXMonorepoRoot(currentPath: string): string
}
