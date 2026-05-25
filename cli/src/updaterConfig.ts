type AutoUpdatePolicy = boolean | 'off' | 'atBackground' | 'atInstall' | 'onLaunch' | 'always' | 'onlyDownload'
type DirectUpdatePolicy = boolean | 'atInstall' | 'always' | 'onLaunch'

export interface CapacitorUpdaterPluginConfig {
  autoUpdate?: AutoUpdatePolicy
  directUpdate?: DirectUpdatePolicy
}

export function usesAlwaysDirectUpdate(config: CapacitorUpdaterPluginConfig | undefined): boolean {
  const autoUpdate = config?.autoUpdate

  if (autoUpdate === 'always')
    return true

  if (typeof autoUpdate === 'string' || autoUpdate === false)
    return false

  const directUpdate = config?.directUpdate
  return directUpdate === true || directUpdate === 'always'
}
