export interface ChannelLike {
  id: number
  name: string
  ios: boolean
  android: boolean
}

export interface PrevDefault {
  id: number
  name: string
}

export interface BuildWarningsOptions {
  includePrimaryChangeMessage?: boolean
  includeEnableSupportMessage?: boolean
}

export function buildPlatformChangeWarnings(params: {
  t: (key: string) => string
  chann: ChannelLike
  type: 'ios' | 'android' | 'both'
  prevIosDefault?: PrevDefault | null
  prevAndroidDefault?: PrevDefault | null
  options?: BuildWarningsOptions
}): string[] {
  const { t, chann, type } = params
  const prevIosDefault = params.prevIosDefault ?? null
  const prevAndroidDefault = params.prevAndroidDefault ?? null
  const includePrimaryChangeMessage = params.options?.includePrimaryChangeMessage ?? true
  const includeEnableSupportMessage = params.options?.includeEnableSupportMessage ?? true

  const warnings: string[] = []

  const needsIosSupport = (type === 'ios' || type === 'both') && !chann.ios
  const needsAndroidSupport = (type === 'android' || type === 'both') && !chann.android

  if (includeEnableSupportMessage && (needsIosSupport || needsAndroidSupport)) {
    const platformNames: string[] = []
    if (needsIosSupport)
      platformNames.push('iOS')
    if (needsAndroidSupport)
      platformNames.push('Android')
    const enableMsg = t('enable-platform-support-message')
      .replaceAll('$CHANNEL', chann.name)
      .replaceAll('$PLATFORMS', platformNames.join(' and '))
    if (enableMsg && enableMsg.trim().length > 0)
      warnings.push(enableMsg)
  }

  if (type === 'ios' || (type === 'both' && needsIosSupport)) {
    if (includePrimaryChangeMessage && !chann.ios) {
      const msg = t('confirm-platform-change-ios-message')
        .replaceAll('$1', chann.name)
        .replaceAll('$2', (prevIosDefault && prevIosDefault.name) ? prevIosDefault.name : t('undefined'))
      warnings.push(msg)
    }
    if (type !== 'both' && chann.android && prevAndroidDefault && prevAndroidDefault.id !== chann.id) {
      warnings.push(
        t('disable-android-on-selected-channel-different-default')
          .replaceAll('$1', chann.name)
          .replaceAll('$2', prevAndroidDefault.name),
      )
    }
    if (type !== 'both' && prevIosDefault && prevIosDefault.id !== chann.id) {
      warnings.push(
        t('disable-ios-on-current-default').replaceAll('$1', prevIosDefault.name),
      )
    }
  }

  if (type === 'android' || (type === 'both' && needsAndroidSupport)) {
    if (includePrimaryChangeMessage && !chann.android) {
      const msg = t('confirm-platform-change-android-message')
        .replaceAll('$1', chann.name)
        .replaceAll('$2', (prevAndroidDefault && prevAndroidDefault.name) ? prevAndroidDefault.name : t('undefined'))
      warnings.push(msg)
    }
    if (type !== 'both' && chann.ios && prevIosDefault && prevIosDefault.id !== chann.id) {
      warnings.push(
        t('disable-ios-on-selected-channel-different-default')
          .replaceAll('$1', chann.name)
          .replaceAll('$2', prevIosDefault.name),
      )
    }
    if (type !== 'both' && prevAndroidDefault && prevAndroidDefault.id !== chann.id) {
      warnings.push(
        t('disable-android-on-current-default').replaceAll('$1', prevAndroidDefault.name),
      )
    }
  }

  return warnings
}

export function buildPlatformDisableWarnings(params: {
  t: (key: string) => string
  chann: ChannelLike
  platform: 'ios' | 'android'
}): string[] {
  const { t, chann, platform } = params
  const warnings: string[] = []
  if (platform === 'ios') {
    warnings.push(
      t('disable-ios-on-current-default').replaceAll('$1', chann.name),
    )
  }
  else {
    warnings.push(
      t('disable-android-on-current-default').replaceAll('$1', chann.name),
    )
  }
  return warnings
}

export function buildUnsetWarnings(params: {
  t: (key: string) => string
  type: 'ios' | 'android' | 'both'
  defaultChannelIos: PrevDefault | null | undefined
  defaultChannelAndroid: PrevDefault | null | undefined
  defaultChannelSync: boolean
}): string[] {
  const { t, type, defaultChannelIos, defaultChannelAndroid, defaultChannelSync } = params
  const warnings: string[] = []

  const iosId = defaultChannelIos?.id ?? null
  const androidId = defaultChannelAndroid?.id ?? null
  const channelsAreSynced = !!iosId && !!androidId && iosId === androidId

  if (type !== 'both') {
    if (channelsAreSynced) {
      // If both defaults point to the same channel, unsetting one platform will disable that platform on the remaining default channel
      const ch = type === 'ios' ? defaultChannelIos : defaultChannelAndroid
      if (ch?.name) {
        warnings.push(
          type === 'ios'
            ? t('disable-ios-on-current-default').replaceAll('$1', ch.name)
            : t('disable-android-on-current-default').replaceAll('$1', ch.name),
        )
      }
    }
    if (channelsAreSynced && !defaultChannelSync) {
      warnings.push(
        type === 'ios'
          ? t('confirm-unset-synced-channel-ios-message')
          : t('confirm-unset-synced-channel-android-message'),
      )
    }
  }

  return warnings
}
