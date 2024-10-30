import { Buffer } from 'node:buffer'
import { createDecipheriv, createHash, publicDecrypt, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupCli, getSemver, prepareCli, runCli, tempFileFolder } from './cli-utils'
import { getSupabaseClient, getUpdate, getUpdateBaseData, resetAndSeedAppData, responseOk } from './test-utils'

describe('test key generation', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.cli_${id}`
  beforeEach(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
  })

  it('test key generation', async () => {
    // set the key to an empty string. Otherwise runCli will not work
    const output = await runCli(['key', 'create', '--force'], id, false, '')
    expect(output).toContain('Private key saved in')
    const privateKeyPath = output.split('\n').find(val => val.includes('Private key saved in'))?.split(' ').at(-1)
    expect(privateKeyPath).toBeDefined()

    const privateKeyFinalPath = join(tempFileFolder(id), privateKeyPath!)
    expect(existsSync(privateKeyFinalPath!)).toBe(true)
    const keyData = readFileSync(privateKeyFinalPath, 'utf-8')
    expect(keyData).toBeTruthy()
    expect(keyData.length).toBeGreaterThan(1)
    expect(keyData).toContain('PRIVATE KEY')

    const publicKeyFinalPath = `${privateKeyFinalPath}.pub`
    expect(existsSync(publicKeyFinalPath!)).toBe(true)
    const publicKeyData = readFileSync(publicKeyFinalPath, 'utf-8')
    expect(publicKeyData).toBeTruthy()
    expect(publicKeyData.length).toBeGreaterThan(1)
    expect(publicKeyData).toContain('PUBLIC KEY')
  })
  cleanupCli(id)
})

describe('tests CLI encryption encrypt/upload/download/decrypt', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.cli_${id}`
  let semver = getSemver()

  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
  })
  async function testEncryption(publicKey: string, output2: string) {
    const checksum = output2.split('\n').find(line => line.includes('Checksum'))?.split(' ').at(-1) as string
    expect(checksum).toBeDefined()
    expect(checksum?.length).toBe(64)

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.checksum).not.toBe(checksum)

    // the checksum check will be done indirectly later, after the download.

    expect(data?.session_key).toBeTruthy()
    expect(data?.session_key?.split(':').length).toBe(2)

    // let's not download the bundle
    const baseData = getUpdateBaseData(APPNAME)
    const response = await getUpdate(baseData)
    await responseOk(response, 'Update new bundle')

    const responseJson = await response.json<{ url: string, version: string }>()
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

  it('test create key', async () => {
    const output = await runCli(['key', 'create', '--force'], id, false, '')
    expect(output).toContain('Private key saved in')
    const privateKeyPath = output.split('\n').find(val => val.includes('Private key saved in'))?.split(' ').at(-1)
    expect(privateKeyPath).toBeDefined()

    const publicKeyFile = readFileSync(join(tempFileFolder(id), '.capgo_key_v2.pub'), 'utf-8')
    expect(publicKeyFile).toBeTruthy()
    expect(publicKeyFile).toContain('PUBLIC KEY')
  })

  it('test upload bundle with auto encryption ', async () => {
    const publicKeyFile = readFileSync(join(tempFileFolder(id), '.capgo_key_v2.pub'), 'utf-8')
    semver = getSemver(semver)
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false)
    expect(output2).toContain('Time to share your update to the world')
    expect(output2).toContain('Encrypting your bundle')

    await testEncryption(publicKeyFile, output2)
  })

  it('test upload bundle with custom key data ', async () => {
    semver = getSemver(semver)
    const privateKeyFile = readFileSync(join(tempFileFolder(id), '.capgo_key_v2'), 'utf-8')
    const output4 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--key-data-v2', `'${privateKeyFile}'`], id, false)
    expect(output4).toContain('Time to share your update to the world')
    expect(output4).toContain('Encrypting your bundle')

    await testEncryption(privateKeyFile, output4)
  })

  it('test upload bundle with custom key path ', async () => {
    // test with key data
    const privateKeyFile = readFileSync(join(tempFileFolder(id), '.capgo_key_v2'), 'utf-8')
    expect(privateKeyFile).toContain('PRIVATE KEY')

    renameSync(join(tempFileFolder(id), '.capgo_key_v2'), join(tempFileFolder(id), 'wierd_file'))
    rmSync(join(tempFileFolder(id), '.capgo_key_v2.pub'))

    semver = getSemver(semver)
    const output3 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--key-v2', 'wierd_file'], id, false)
    expect(output3).toContain('Time to share your update to the world')
    expect(output3).toContain('Encrypting your bundle')

    await testEncryption(privateKeyFile, output3)
  })
  cleanupCli(id)
})

describe('tests CLI upload no encryption', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.cli_${id}`
  let semver = getSemver()

  beforeEach(async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME, id)
  })

  it('test upload without encryption NEW', async () => {
    const output = await runCli(['key', 'create', '--force'], id, false, '')
    expect(output).toContain('Private key saved in')
    const privateKeyPath = output.split('\n').find(val => val.includes('Private key saved in'))?.split(' ').at(-1)
    expect(privateKeyPath).toBeDefined()

    const publicKeyFile = readFileSync(join(tempFileFolder(id), '.capgo_key_v2.pub'), 'utf-8')
    expect(publicKeyFile).toBeTruthy()
    expect(publicKeyFile).toContain('PUBLIC KEY')

    semver = getSemver(semver)
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--no-key'], id, false)
    expect(output2).toContain('Time to share your update to the world')
    expect(output2).not.toContain('Encrypting your bundle')

    const checksum = output2.split('\n').find(line => line.includes('Checksum'))?.split(' ').at(-1) as string
    expect(checksum).toBeDefined()
    expect(checksum?.length).toBe(8)

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()

    expect(error).toBeNull()
    expect(data?.checksum).toBe(checksum)

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
  })
  cleanupCli(id)
})
