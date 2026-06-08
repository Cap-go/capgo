import type { OptionsUpload } from './upload_interface'
import { onboardingBuilderCommand } from '../build/onboarding/command'
import { requestBuildCommand } from '../build/request'
import { getPreviewQr } from '../preview/qr'
import { uploadBundle } from './upload'
import { buildBundleUploadPreviewQrOptions } from './upload-preview-qr'

/**
 * `bundle upload` command handler. Uploads the bundle, then — when the bundle is
 * incompatible and the user opted into Capgo Builder — launches the Ink-based
 * build flow. Kept out of `upload.ts` so the programmatic SDK bundle (which
 * imports `uploadBundleInternal`) never statically pulls in `ink`.
 */
export async function handleBundleUploadCommand(appId: string, options: OptionsUpload): Promise<void> {
  const result = await uploadBundle(appId, options)
  if (options.qrPreview && result?.bundle && result.reason !== 'DRY_UPLOAD' && !result.builderAction)
    await getPreviewQr(appId, undefined, buildBundleUploadPreviewQrOptions(options, result.bundle))

  if (!result?.builderAction)
    return

  if (result.builderAction === 'launch-onboarding')
    await onboardingBuilderCommand({ apikey: options.apikey })
  else
    // Don't forward options.path — for `bundle upload` it's the web asset dir,
    // but `build request` treats `path` as the Capacitor project root.
    await requestBuildCommand(appId ?? '', { apikey: options.apikey, supaHost: options.supaHost, supaAnon: options.supaAnon })
}
