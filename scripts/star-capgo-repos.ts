#!/usr/bin/env npx ts-node

/**
 * Script to star all Cap-go repositories using the GitHub API
 *
 * Usage:
 *   GITHUB_TOKEN=your_token npx ts-node scripts/star-capgo-repos.ts
 *
 * Or set GITHUB_TOKEN in your environment
 */
// const a = Array.from(document.querySelector('#plugins-grid').childNodes)
// b = a.filter(a => Array.from(a.childNodes).length > 0)
// const c = b.map(x => Array.from(Array.from(Array.from(x.childNodes).find(x => x.localName == 'div').childNodes).find(x => x.className == 'flex gap-2').childNodes).find(x => x.rel == 'noopener noreferrer').href )

const CAPGO_REPOS = [
  "https://github.com/Cap-go/capacitor-updater/",
  "https://github.com/Cap-go/capacitor-inappbrowser/",
  "https://github.com/Cap-go/capacitor-native-biometric/",
  "https://github.com/RevenueCat/purchases-capacitor/",
  "https://github.com/Cap-go/capacitor-social-login/",
  "https://github.com/Cap-go/capacitor-navigation-bar/",
  "https://github.com/Cap-go/capacitor-shake/",
  "https://github.com/Cap-go/capacitor-mute/",
  "https://github.com/Cap-go/capacitor-native-audio/",
  "https://github.com/Cap-go/capacitor-twilio-voice/",
  "https://github.com/Cap-go/capacitor-home-indicator/",
  "https://github.com/Cap-go/capacitor-nativegeocoder/",
  "https://github.com/Cap-go/capacitor-camera-preview/",
  "https://github.com/Cap-go/capacitor-native-purchases/",
  "https://github.com/Cap-go/capacitor-flash/",
  "https://github.com/Cap-go/capacitor-autofill-save-password/",
  "https://github.com/Cap-go/capacitor-screen-recorder/",
  "https://github.com/Cap-go/capacitor-native-market/",
  "https://github.com/Cap-go/capacitor-crisp/",
  "https://github.com/Cap-go/capacitor-uploader/",
  "https://github.com/Cap-go/capacitor-health/",
  "https://github.com/Cap-go/capacitor-data-storage-sqlite/",
  "https://github.com/Cap-go/capacitor-document-scanner/",
  "https://github.com/Cap-go/capacitor-persistent-account/",
  "https://github.com/Cap-go/capacitor-android-usagestatsmanager/",
  "https://github.com/Cap-go/capacitor-downloader/",
  "https://github.com/Cap-go/capacitor-alarm/",
  "https://github.com/Cap-go/capacitor-audio-recorder/",
  "https://github.com/Cap-go/capacitor-video-player/",
  "https://github.com/Cap-go/capacitor-env/",
  "https://github.com/Cap-go/capacitor-is-root/",
  "https://github.com/Cap-go/capacitor-ivs-player/",
  "https://github.com/Cap-go/capacitor-photo-library/",
  "https://github.com/Cap-go/capacitor-sim/",
  "https://github.com/Cap-go/capacitor-pedometer/",
  "https://github.com/Cap-go/capacitor-android-inline-install/",
  "https://github.com/Cap-go/capacitor-nfc/",
  "https://github.com/Cap-go/capacitor-pay/",
  "https://github.com/Cap-go/capacitor-llm/",
  "https://github.com/Cap-go/capacitor-media-session/",
  "https://github.com/Cap-go/capacitor-launch-navigator/",
  "https://github.com/Cap-go/capacitor-wifi/",
  "https://github.com/Cap-go/capacitor-jw-player/",
  "https://github.com/Cap-go/capacitor-volume-buttons/",
  "https://github.com/Cap-go/capacitor-mux-player/",
  "https://github.com/Cap-go/capacitor-realtimekit/",
  "https://github.com/Cap-go/capacitor-admob/",
  "https://github.com/Cap-go/capacitor-accelerometer/",
  "https://github.com/Cap-go/capacitor-in-app-review/",
  "https://github.com/Cap-go/capacitor-screen-orientation/",
  "https://github.com/Cap-go/capacitor-wechat/",
  "https://github.com/Cap-go/capacitor-speech-recognition/",
  "https://github.com/Cap-go/capacitor-share-target/",
  "https://github.com/Cap-go/capacitor-fast-sql/",
  "https://github.com/Cap-go/capacitor-textinteraction/",
  "https://github.com/Cap-go/capacitor-webview-guardian/",
  "https://github.com/Cap-go/capacitor-barometer/",
  "https://github.com/Cap-go/capacitor-gtm/",
  "https://github.com/Cap-go/capacitor-speech-synthesis/",
  "https://github.com/Cap-go/capacitor-pdf-generator/",
  "https://github.com/Cap-go/capacitor-zip/",
  "https://github.com/Cap-go/capacitor-youtube-player/",
  "https://github.com/Cap-go/capacitor-compass/",
  "https://github.com/Cap-go/capacitor-contacts/",
  "https://github.com/Cap-go/capacitor-file/",
  "https://github.com/Cap-go/capacitor-file-compressor/",
  "https://github.com/Cap-go/capacitor-ibeacon/",
  "https://github.com/Cap-go/capacitor-printer/",
  "https://github.com/Cap-go/capacitor-android-age-signals/",
  "https://github.com/Cap-go/capacitor-android-kiosk/",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/analytics",
  "https://github.com/Cap-go/capacitor-bluetooth-low-energy/",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/authentication",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/storage",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/crashlytics",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/messaging",
  "https://github.com/Cap-go/capacitor-plus/",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/app",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/performance",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/firestore",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/functions",
  "https://github.com/Cap-go/capacitor-plus/",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/app-check",
  "https://github.com/Cap-go/capacitor-firebase/tree/main/packages/remote-config",
  "https://github.com/Cap-go/capacitor-plus/",
  "https://github.com/Cap-go/capacitor-plus/",
  "https://github.com/Cap-go/capacitor-keep-awake/",
  "https://github.com/Cap-go/capacitor-file-picker/",
  "https://github.com/Cap-go/capacitor-ffmpeg/",
  "https://github.com/Cap-go/capacitor-streamcall/",
  "https://github.com/Cap-go/capacitor-ricoh360-camera-plugin/",
  "https://github.com/Cap-go/capacitor-appinsights/",
  "https://github.com/Cap-go/capacitor-audiosession/",
  "https://github.com/Cap-go/capacitor-background-geolocation/",
  "https://github.com/Cap-go/capacitor-live-reload/",
  "https://github.com/Cap-go/capacitor-watch/",
  "https://github.com/Cap-go/capacitor-brightness/",
  "https://github.com/Cap-go/capacitor-light-sensor/",
  "https://github.com/Cap-go/capacitor-video-thumbnails/",
  "https://github.com/Cap-go/capacitor-intent-launcher/"
]

function parseGitHubUrl(url: string): { owner: string, repo: string } | null {
  // Handle URLs like:
  // https://github.com/Cap-go/capacitor-updater/
  // https://github.com/Cap-go/capacitor-firebase/tree/main/packages/analytics
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

async function starRepo(token: string, repoUrl: string): Promise<{ success: boolean, status: number, message: string, repo: string }> {
  const parsed = parseGitHubUrl(repoUrl)
  if (!parsed) {
    return { success: false, status: 0, message: 'Invalid GitHub URL', repo: repoUrl }
  }
  const { owner, repo: repoName } = parsed
  const url = `https://api.github.com/user/starred/${owner}/${repoName}`

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Length': '0',
      },
    })

    const repoDisplay = `${owner}/${repoName}`
    if (response.status === 204) {
      return { success: true, status: 204, message: 'Starred successfully', repo: repoDisplay }
    }
    else if (response.status === 304) {
      return { success: true, status: 304, message: 'Already starred', repo: repoDisplay }
    }
    else {
      const text = await response.text()
      return { success: false, status: response.status, message: text, repo: repoDisplay }
    }
  }
  catch (error) {
    return { success: false, status: 0, message: String(error), repo: repoUrl }
  }
}

async function main() {
  const token = process.env.GITHUB_PRIVATE_TOKEN

  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required')
    console.error('Usage: GITHUB_TOKEN=your_token npx ts-node scripts/star-capgo-repos.ts')
    process.exit(1)
  }

  console.log(`Starring ${CAPGO_REPOS.length} repositories...\n`)
  let successCount = 0
  let failCount = 0

  for (const repo of CAPGO_REPOS) {
    const result = await starRepo(token, repo)

    if (result.success) {
      console.log(`✓ ${repo} - ${result.message}`)
      successCount++
    }
    else {
      console.log(`✗ ${repo} - Failed (${result.status}): ${result.message}`)
      failCount++
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log(`\nDone! Starred: ${successCount}, Failed: ${failCount}`)
}

main()
