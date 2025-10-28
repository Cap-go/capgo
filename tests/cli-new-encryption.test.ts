import { Buffer } from 'node:buffer'
import { createDecipheriv, createHash, publicDecrypt, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { generateEncryptionKeysSDK, uploadBundleSDK } from './cli-sdk-utils'
import { cleanupCli, getSemver, prepareCli, tempFileFolder } from './cli-utils'
import { getSupabaseClient, getUpdate, getUpdateBaseData, resetAndSeedAppData, resetAppData, resetAppDataStats, responseOk } from './test-utils'

describe.concurrent('test key generation', () => {
  it.concurrent('test key generation', async () => {
    const id = randomUUID()
    const APPNAME = `com.cli_new_encryption_${id}`
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)

    try {
      const result = await generateEncryptionKeysSDK(APPNAME, true)
      expect(result.success).toBe(true)

      const privateKeyPath = '.capgo_key_v2'
      const privateKeyFinalPath = join(tempFileFolder(APPNAME), privateKeyPath)
      expect(existsSync(privateKeyFinalPath)).toBe(true)
      const keyData = readFileSync(privateKeyFinalPath, 'utf-8')
      expect(keyData).toBeTruthy()
      expect(keyData.length).toBeGreaterThan(1)
      expect(keyData).toContain('PRIVATE KEY')

      const publicKeyFinalPath = `${privateKeyFinalPath}.pub`
      expect(existsSync(publicKeyFinalPath)).toBe(true)
      const publicKeyData = readFileSync(publicKeyFinalPath, 'utf-8')
      expect(publicKeyData).toBeTruthy()
      expect(publicKeyData.length).toBeGreaterThan(1)
      expect(publicKeyData).toContain('PUBLIC KEY')
    }
    finally {
      await cleanupCli(APPNAME)
      await resetAppData(APPNAME)
      await resetAppDataStats(APPNAME)
    }
  })
})

describe.concurrent('tests CLI encryption encrypt/upload/download/decrypt', () => {
  async function testEncryption(publicKey: string, semver: string, appName: string, skipUpdate = false) {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .eq('app_id', appName)
      .single()
      .throwOnError()

    expect(error).toBeNull()

    // Get the encrypted checksum from database and decrypt it
    const decryptedChecksum = publicDecrypt(publicKey, new Uint8Array(Buffer.from(data!.checksum!, 'base64')))
    const checksum = decryptedChecksum.toString('base64')
    expect(checksum?.length).toBe(64)

    expect(data?.session_key).toBeTruthy()
    expect(data?.session_key?.split(':').length).toBe(2)

    if (!skipUpdate) {
    // let's not download the bundle
      const baseData = getUpdateBaseData(appName)
      const response = await getUpdate(baseData)
      await responseOk(response, 'Update new bundle')

      const responseJson = await response.json<{ url: string, version: string }>()
      // console.log('responseJson', responseJson)
      expect(responseJson.url).toBeDefined()
      expect(responseJson.version).toBe(semver)

      const downloadResponse = await fetch(responseJson.url)
      await responseOk(downloadResponse, 'Download new bundle')
      const encryptedArrayBuffer = await downloadResponse.arrayBuffer()
      expect(encryptedArrayBuffer.byteLength).toBeGreaterThan(0)

      const encryptedBufferStr = data?.session_key?.split(':').at(1)
      expect(encryptedBufferStr).toBeTruthy()

      const ivStr = data?.session_key?.split(':').at(0)
      expect(ivStr).toBeTruthy()

      const encryptedBuffer = Buffer.from(encryptedBufferStr!, 'base64')
      const aesKey = publicDecrypt(publicKey, new Uint8Array(encryptedBuffer))
      expect(aesKey.length).toBe(16)

      // The Initialization Vector (IV) used during encryption (16 bytes for AES)
      const iv = Buffer.from(ivStr!, 'base64')
      expect(iv.length).toBeGreaterThan(0)

      const decipher = createDecipheriv('aes-128-cbc', Uint8Array.from(aesKey), Uint8Array.from(iv))
      // Decrypt without specifying output encoding to get Buffers
      const decryptedChunks = []
      decryptedChunks.push(decipher.update(new Uint8Array(encryptedArrayBuffer)))
      decryptedChunks.push(decipher.final())

      // Concatenate all Buffer chunks
      const decrypted = Buffer.concat(decryptedChunks.map(buf => new Uint8Array(buf)))

      expect(decrypted.length).toBeGreaterThan(0)

      const zip = new AdmZip(Buffer.from(decrypted))
      const zipEntries = zip.getEntries()

      expect(zipEntries.length).toBe(2)

      const indexJsEntry = zipEntries.find(entry => entry.entryName.includes('index.js'))
      expect(indexJsEntry).toBeDefined()

      const indexJsContent = indexJsEntry!.getData().toString('utf8')
      expect(indexJsContent).toBe('import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log(\"Hello world!!!\");\nCapacitorUpdater.notifyAppReady();')

      // now, let's verify the checksum
      const hash = createHash('sha256')

      // Update the hash with your buffer data
      hash.update(new Uint8Array(decrypted))

      // Compute the hash digest in hexadecimal format
      const calculatedSha256Hash = hash.digest('hex')
      expect(calculatedSha256Hash).toBe(checksum)

      const decryptedChecksum = publicDecrypt(publicKey, new Uint8Array(Buffer.from(data!.checksum!, 'base64')))
      const decryptedChecksumStr = decryptedChecksum.toString('base64')
      expect(decryptedChecksumStr).toBe(calculatedSha256Hash)
      expect(decryptedChecksumStr).toBe(checksum) // redundent, but I will keep it
    }
    else {
      const decryptedChecksum = publicDecrypt(publicKey, new Uint8Array(Buffer.from(data!.checksum!, 'base64')))
      const decryptedChecksumStr = decryptedChecksum.toString('base64')
      expect(decryptedChecksumStr).toBe(checksum)
    }
  }

  it.concurrent('test upload bundle with auto encryption', async () => {
    const id = randomUUID()
    const APPNAME = `com.cli_new_encryption_auto_${id}`
    let semver = getSemver()

    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)

    try {
      // Create key
      const keyResult = await generateEncryptionKeysSDK(APPNAME, true)
      expect(keyResult.success).toBe(true)

      const publicKeyFile = readFileSync(join(tempFileFolder(APPNAME), '.capgo_key_v2.pub'), 'utf-8')
      expect(publicKeyFile).toBeTruthy()
      expect(publicKeyFile).toContain('PUBLIC KEY')

      semver = getSemver(semver)
      const result = await uploadBundleSDK(APPNAME, semver, 'production', {
        ignoreCompatibilityCheck: true,
        encrypt: true,
        encryptionKey: join(tempFileFolder(APPNAME), '.capgo_key_v2'),
      })
      expect(result.success).toBe(true)

      await testEncryption(publicKeyFile, semver, APPNAME)
    }
    finally {
      await cleanupCli(APPNAME)
      await resetAppData(APPNAME)
      await resetAppDataStats(APPNAME)
    }
  })

  it.concurrent('test upload bundle with custom key data', async () => {
    const id = randomUUID()
    const APPNAME = `com.cli_new_encryption_keydata_${id}`
    let semver = getSemver()

    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)

    try {
      // Create key
      const keyResult = await generateEncryptionKeysSDK(APPNAME, true)
      expect(keyResult.success).toBe(true)

      semver = getSemver(semver)
      const publicKeyFile = readFileSync(join(tempFileFolder(APPNAME), '.capgo_key_v2.pub'), 'utf-8')
      const privateKeyPath = join(tempFileFolder(APPNAME), '.capgo_key_v2')

      const result = await uploadBundleSDK(APPNAME, semver, 'production', {
        ignoreCompatibilityCheck: true,
        encryptionKey: privateKeyPath,
      })
      expect(result.success).toBe(true)

      await testEncryption(publicKeyFile, semver, APPNAME, true)
    }
    finally {
      await cleanupCli(APPNAME)
      await resetAppData(APPNAME)
      await resetAppDataStats(APPNAME)
    }
  })

  it.concurrent('test upload bundle with custom key path', async () => {
    const id = randomUUID()
    const APPNAME = `com.cli_new_encryption_keypath_${id}`
    let semver = getSemver()

    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)

    try {
      // Create key
      const keyResult = await generateEncryptionKeysSDK(APPNAME, true)
      expect(keyResult.success).toBe(true)

      // test with key path
      const publicKeyFile = readFileSync(join(tempFileFolder(APPNAME), '.capgo_key_v2.pub'), 'utf-8')
      const privateKeyFile = readFileSync(join(tempFileFolder(APPNAME), '.capgo_key_v2'), 'utf-8')
      expect(privateKeyFile).toContain('PRIVATE KEY')

      renameSync(join(tempFileFolder(APPNAME), '.capgo_key_v2'), join(tempFileFolder(APPNAME), 'wierd_file'))
      rmSync(join(tempFileFolder(APPNAME), '.capgo_key_v2.pub'))

      semver = getSemver(semver)
      const result = await uploadBundleSDK(APPNAME, semver, 'production', {
        ignoreCompatibilityCheck: true,
        encryptionKey: join(tempFileFolder(APPNAME), 'wierd_file'),
      })
      expect(result.success).toBe(true)

      await testEncryption(publicKeyFile, semver, APPNAME, true)
    }
    finally {
      await cleanupCli(APPNAME)
      await resetAppData(APPNAME)
      await resetAppDataStats(APPNAME)
    }
  })
})

describe.concurrent('tests CLI upload no encryption', () => {
  it.concurrent('test upload without encryption NEW', async () => {
    const id = randomUUID()
    const APPNAME = `com.cli_no_encryption_${id}`
    let semver = getSemver()

    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)

    try {
      // Create key
      const keyResult = await generateEncryptionKeysSDK(APPNAME, true)
      expect(keyResult.success).toBe(true)

      const publicKeyFile = readFileSync(join(tempFileFolder(APPNAME), '.capgo_key_v2.pub'), 'utf-8')
      expect(publicKeyFile).toBeTruthy()
      expect(publicKeyFile).toContain('PUBLIC KEY')

      semver = getSemver(semver)
      const result = await uploadBundleSDK(APPNAME, semver, 'production', {
        ignoreCompatibilityCheck: true,
        encrypt: false,
      })
      expect(result.success).toBe(true)

      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .eq('name', semver)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()

      expect(error).toBeNull()
      expect(data?.checksum).toBeTruthy()
      expect(data?.checksum?.length).toBe(64)
      expect(data?.session_key).toBeNull()

      const baseData = getUpdateBaseData(APPNAME)
      const response = await getUpdate(baseData)
      await responseOk(response, 'Update new bundle')

      const responseJson = await response.json<{ url: string, version: string }>()
      expect(responseJson.url).toBeDefined()
      expect(responseJson.version).toBe(semver)

      const downloadResponse = await fetch(responseJson.url)
      await responseOk(downloadResponse, 'Download new bundle')
      const arrayBuffer = await downloadResponse.arrayBuffer()

      const zip = new AdmZip(Buffer.from(arrayBuffer))
      const zipEntries = zip.getEntries()

      expect(zipEntries.length).toBe(2)
    }
    finally {
      await cleanupCli(APPNAME)
      await resetAppData(APPNAME)
      await resetAppDataStats(APPNAME)
    }
  })
})
