// src/build/onboarding/pip-tutorial.ts
//
// Picture-in-Picture tutorial playback for the macOS Apple-Developer-Portal
// recovery step. Lets the user see a short walkthrough video in a floating
// PiP window WHILE they have the portal open in their browser, so they can
// follow along step by step instead of context-switching.
//
// Architecture:
//
//   1. precompilePipHelper() — runs `swiftc` once to compile the embedded
//      AVKit-based Swift helper to a cached binary in the OS tmp dir,
//      keyed by CLI version. Computes SHA1 of the binary and returns
//      both. Cheap to call repeatedly — cache hit short-circuits.
//
//   2. predownloadVideo(url) — streams the tutorial video to tmp, hashing
//      the bytes as they flow. Returns the local path + SHA1.
//
//   3. verifyAndPlayPip(...) — re-hashes both files from disk and compares
//      against the SHA1s captured at precompile/predownload time. If either
//      mismatches, the file was modified between the bg task and the play
//      call (tampering / cache corruption / disk error). Throws in that
//      case. If both match, spawns the Swift binary with the video path
//      and returns immediately (the helper runs detached so the Ink app
//      keeps responding).
//
// Background-task pattern (driven from app.tsx):
//   - On entering the macOS import flow, kick off precompilePipHelper()
//     and predownloadVideo() in parallel; store the promises in refs.
//   - When the user picks "Open Apple Developer Portal", await both
//     promises with a 5-second budget + spinner. If either is still
//     pending after 5s, fall back to opening the YouTube URL in a
//     browser instead of starting PiP.
//   - If SHA1 verification fails at play time, also fall back to
//     YouTube (and tell the user why).
//
// Why SHA1 (not SHA256): consistency with the rest of the onboarding
// flow (macos-signing's `computeCertSha1` uses SHA1 because macOS itself
// reports identities that way). This is a tamper / integrity check, not
// a security primitive — anyone with write access to /tmp could also
// have replaced the binary outright, so the hash exists to catch the
// "file changed between precompile and play" mistake, not to defend
// against a determined attacker. The hash function is fine for this use.

import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { chmod, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'

/**
 * Embedded AVKit-based helper. Compiled with `swiftc` at first use.
 *
 * Accepts either an https URL or a local file path as argv[1].
 *
 *   - https → AVPlayer streams it.
 *   - local → AVPlayer plays from disk.
 *
 * Brings up a small NSWindow, requests PiP, hides the host window when
 * PiP starts so the user sees only the floating tutorial overlay, and
 * terminates when PiP stops.
 *
 * Kept inline as a string (instead of shipped as a .swift file) so the
 * CLI build doesn't need an extra packaging step — the binary that
 * eventually lands in user dist/ is the only thing that needs to know
 * about this source.
 */
const SWIFT_PIP_SOURCE = `import AppKit
import AVKit
import Foundation

final class PiPApp: NSObject, NSApplicationDelegate, AVPictureInPictureControllerDelegate {
    var window: NSWindow!
    var player: AVPlayer!
    var pip: AVPictureInPictureController?
    var attempts = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard CommandLine.arguments.count >= 2 else {
            FileHandle.standardError.write("usage: capgo-pip-helper <video-path-or-url>\\n".data(using: .utf8)!)
            exit(2)
        }
        let arg = CommandLine.arguments[1]
        let url: URL
        if arg.hasPrefix("http://") || arg.hasPrefix("https://") {
            guard let u = URL(string: arg) else { exit(2) }
            url = u
        } else {
            url = URL(fileURLWithPath: arg)
        }

        let view = NSView(frame: NSRect(x: 0, y: 0, width: 640, height: 360))
        view.wantsLayer = true

        player = AVPlayer(url: url)
        let layer = AVPlayerLayer(player: player)
        layer.frame = view.bounds
        layer.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
        view.layer?.addSublayer(layer)

        window = NSWindow(contentRect: view.frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = view
        window.orderFront(nil)

        pip = AVPictureInPictureController(playerLayer: layer)
        pip?.delegate = self
        player.play()

        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { timer in
            self.attempts += 1
            if self.pip?.isPictureInPicturePossible == true {
                timer.invalidate()
                self.pip?.startPictureInPicture()
            }
            if self.attempts > 120 {
                timer.invalidate()
                exit(1)
            }
        }
    }

    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        window.orderOut(nil)
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        NSApp.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = PiPApp()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
`

/**
 * Tamper-detection error thrown when a file's SHA1 at play time differs
 * from the value captured at precompile/predownload time. Distinct from
 * a generic Error so the caller can specifically fall back to the
 * YouTube URL (vs. crashing the onboarding flow).
 */
export class PipTamperError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipTamperError'
  }
}

export interface PrecompiledPipHelper {
  binaryPath: string
  /** SHA1 of the compiled binary as it appeared on disk immediately after compile. */
  sha1: string
}

export interface PredownloadedVideo {
  localPath: string
  /** SHA1 of the downloaded video bytes as written to disk. */
  sha1: string
}

/**
 * Path to the cached compiled PiP helper. Keyed by CLI version so a CLI
 * upgrade triggers a fresh compile and we don't end up running stale
 * Swift on a new build.
 */
function tmpCachedBinaryPath(): string {
  const version = process.env.CAPGO_CLI_VERSION || process.env.npm_package_version || 'dev'
  return join(tmpdir(), `capgo-pip-helper-v${version}`)
}

/**
 * SHA1 a file by streaming, so we don't have to buffer the full bytes
 * in memory. Returns lowercase hex.
 */
async function sha1File(path: string): Promise<string> {
  const hash = createHash('sha1')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/**
 * Compile the embedded Swift PiP helper to a cached binary. Returns the
 * binary path + its SHA1. Idempotent — second call returns the cached
 * binary's SHA1 without re-compiling.
 *
 * Throws if `swiftc` is missing (`xcode-select --install` recovery hint
 * included in the error message). Callers should treat this as
 * "PiP unavailable, fall back to YouTube" rather than a fatal error.
 */
export async function precompilePipHelper(): Promise<PrecompiledPipHelper> {
  const outPath = tmpCachedBinaryPath()
  if (!existsSync(outPath)) {
    const srcPath = join(tmpdir(), `capgo-pip-helper-${randomBytes(6).toString('hex')}.swift`)
    await writeFile(srcPath, SWIFT_PIP_SOURCE, 'utf-8')
    try {
      const tmpOut = `${outPath}.${randomBytes(6).toString('hex')}.tmp`
      const result = await new Promise<{ code: number | null, stderr: string }>((resolveRun) => {
        const child = spawn('swiftc', [
          srcPath,
          '-framework', 'AVKit',
          '-framework', 'AppKit',
          '-O',
          '-o', tmpOut,
        ], { stdio: ['ignore', 'pipe', 'pipe'] })
        let stderr = ''
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf-8')
        })
        child.once('error', (err) => {
          resolveRun({ code: null, stderr: `${stderr}${err instanceof Error ? err.message : String(err)}` })
        })
        child.once('close', (code) => {
          resolveRun({ code, stderr })
        })
      })
      if (result.code !== 0) {
        await rm(tmpOut, { force: true }).catch(() => { /* best-effort */ })
        throw new Error(
          `Failed to compile PiP helper with swiftc (exit ${result.code}). `
          + `Make sure Xcode Command Line Tools are installed (xcode-select --install). `
          + `Stderr: ${result.stderr.trim() || '(empty)'}`,
        )
      }
      await chmod(tmpOut, 0o755)
      await rename(tmpOut, outPath)
    }
    finally {
      await rm(srcPath, { force: true }).catch(() => { /* best-effort */ })
    }
  }
  const sha1 = await sha1File(outPath)
  return { binaryPath: outPath, sha1 }
}

/**
 * Stream a tutorial video URL to a tmp file while hashing the bytes
 * inline. Returns the local path + SHA1.
 *
 * Aborts on non-2xx response (caller falls back to YouTube). The tmp
 * filename is randomized so concurrent CLI runs (rare but possible)
 * don't trample each other.
 */
export async function predownloadVideo(url: string): Promise<PredownloadedVideo> {
  const localPath = join(tmpdir(), `capgo-pip-video-${randomBytes(8).toString('hex')}.mov`)
  const res = await fetch(url)
  if (!res.ok || !res.body)
    throw new Error(`Failed to download tutorial video: HTTP ${res.status} ${res.statusText}`)
  const hash = createHash('sha1')
  const writeStream = createWriteStream(localPath)
  try {
    const reader = res.body.getReader()
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read()
      if (done)
        break
      if (value) {
        hash.update(value)
        // Backpressure: if the write returns false, wait for drain.
        if (!writeStream.write(value)) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise<void>(resolveDrain => writeStream.once('drain', () => resolveDrain()))
        }
      }
    }
    await new Promise<void>((resolveEnd, rejectEnd) => {
      writeStream.end((err?: Error | null) => err ? rejectEnd(err) : resolveEnd())
    })
  }
  catch (err) {
    await rm(localPath, { force: true }).catch(() => { /* best-effort */ })
    throw err
  }
  return { localPath, sha1: hash.digest('hex') }
}

export interface VerifyAndPlayArgs {
  binaryPath: string
  /** SHA1 captured at precompile time. Re-checked against the on-disk binary. */
  expectedBinarySha1: string
  videoPath: string
  /** SHA1 captured at predownload time. Re-checked against the on-disk video. */
  expectedVideoSha1: string
  /**
   * Optional: SHA1 the server published for this video file. When set, the
   * downloaded video's SHA1 is also checked against this value. Used for
   * the "refuse to play tampered content" case where the server config
   * carries an authoritative hash of the video as authored by Capgo.
   */
  expectedVideoSha1FromServer?: string
}

/**
 * Verify both SHA1s, then spawn the Swift helper detached and return.
 *
 * Throws PipTamperError on any SHA1 mismatch; callers should fall back
 * to the YouTube URL and tell the user why.
 *
 * The spawned helper runs detached (`detached: true`, `child.unref()`,
 * `stdio: 'ignore'`) so the parent Ink CLI keeps responding while PiP
 * runs in the background. The helper terminates itself when PiP closes.
 */
export async function verifyAndPlayPip(args: VerifyAndPlayArgs): Promise<void> {
  const [actualBinSha, actualVidSha] = await Promise.all([
    sha1File(args.binaryPath),
    sha1File(args.videoPath),
  ])
  if (actualBinSha !== args.expectedBinarySha1) {
    throw new PipTamperError(
      `PiP helper binary changed between precompile and play (expected ${args.expectedBinarySha1.slice(0, 8)}…, got ${actualBinSha.slice(0, 8)}…). `
      + `Refusing to run the modified binary.`,
    )
  }
  if (actualVidSha !== args.expectedVideoSha1) {
    throw new PipTamperError(
      `Tutorial video changed between download and play (expected ${args.expectedVideoSha1.slice(0, 8)}…, got ${actualVidSha.slice(0, 8)}…). `
      + `Refusing to play modified content.`,
    )
  }
  if (args.expectedVideoSha1FromServer && args.expectedVideoSha1FromServer.toLowerCase() !== actualVidSha.toLowerCase()) {
    throw new PipTamperError(
      `Tutorial video doesn't match the SHA1 published by the server `
      + `(server expected ${args.expectedVideoSha1FromServer.slice(0, 8)}…, downloaded ${actualVidSha.slice(0, 8)}…). `
      + `Refusing to play untrusted content.`,
    )
  }
  const child = spawn(args.binaryPath, [args.videoPath], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}
