import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'

export interface MobileprovisionInfo {
  name: string
  uuid: string
  applicationIdentifier: string
  bundleId: string
}

export function parseMobileprovision(filePath: string): MobileprovisionInfo {
  const data = readFileSync(filePath)
  return parseMobileprovisionBuffer(data, filePath)
}

export function parseMobileprovisionFromBase64(base64Content: string): MobileprovisionInfo {
  const data = Buffer.from(base64Content, 'base64')
  return parseMobileprovisionBuffer(data, '<base64 input>')
}

function parseMobileprovisionBuffer(data: Buffer, source: string): MobileprovisionInfo {
  const xmlStartMarker = '<?xml'
  const xmlEndMarker = '</plist>'
  const xmlStartIdx = data.indexOf(xmlStartMarker)
  const xmlEndIdx = xmlStartIdx !== -1 ? data.indexOf(xmlEndMarker, xmlStartIdx) : -1

  if (xmlStartIdx === -1 || xmlEndIdx === -1 || xmlEndIdx <= xmlStartIdx) {
    throw new Error(`No embedded plist found in mobileprovision file: ${source}`)
  }

  const plistXml = data.slice(xmlStartIdx, xmlEndIdx + xmlEndMarker.length).toString('utf-8')

  const name = extractPlistValue(plistXml, 'Name')
  if (!name) {
    throw new Error(`Mobileprovision file missing required 'Name' key: ${source}`)
  }

  const uuid = extractPlistValue(plistXml, 'UUID') || ''
  const applicationIdentifier = extractNestedPlistValue(plistXml, 'Entitlements', 'application-identifier') || ''

  const dotIndex = applicationIdentifier.indexOf('.')
  const bundleId = dotIndex !== -1 ? applicationIdentifier.slice(dotIndex + 1) : applicationIdentifier

  return { name, uuid, applicationIdentifier, bundleId }
}

function extractPlistValue(xml: string, key: string): string | null {
  const regex = new RegExp(`<key>${escapeRegex(key)}</key>\\s*<string>([^<]*)</string>`)
  const match = xml.match(regex)
  return match ? match[1] : null
}

function extractNestedPlistValue(xml: string, dictKey: string, valueKey: string): string | null {
  const dictKeyRegex = new RegExp(`<key>${escapeRegex(dictKey)}</key>\\s*<dict>([\\s\\S]*?)</dict>`)
  const dictMatch = xml.match(dictKeyRegex)
  if (!dictMatch)
    return null
  return extractPlistValue(dictMatch[1], valueKey)
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
