import { Buffer } from 'node:buffer'
import { constants, createDecipheriv, privateDecrypt, randomUUID } from 'node:crypto'
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
    const output = await runCli(['key_old', 'create', '--force'], id, false, '')
    expect(output).toContain('Private key saved in')
    expect(output).toContain('Public key saved in')
    const lines = output.split('\n')
    const found = lines.find(val => val.includes('Public key saved in'))
    expect(found).toBeDefined()
    const publicKeyPath = found?.split(' ').at(-1)
    expect(publicKeyPath).toBeDefined()

    const publicKeyFinalPath = join(tempFileFolder(id), publicKeyPath!)
    expect(existsSync(publicKeyFinalPath!)).toBe(true)
    const keyData = readFileSync(publicKeyFinalPath, 'utf-8')
    expect(keyData).toBeTruthy()
    expect(keyData.length).toBeGreaterThan(1)
    expect(keyData).toContain('PUBLIC KEY')

    const privateKeyFinalPath = join(tempFileFolder(id), publicKeyPath!).replace('.pub', '')
    expect(existsSync(privateKeyFinalPath!)).toBe(true)
    const privateKeyData = readFileSync(privateKeyFinalPath, 'utf-8')
    expect(privateKeyData).toBeTruthy()
    expect(privateKeyData.length).toBeGreaterThan(1)
    expect(privateKeyData).toContain('PRIVATE KEY')
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
  async function checkEncryption(output2: string, privateKey: string) {
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
    expect(data?.session_key).toBeTruthy()
    expect(data?.session_key?.split(':').length).toBe(2)

    // let's now download the bundle
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

    const aesKey = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Uint8Array.from(encryptedBuffer),
    )
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
  }
  it('test create key ', async () => {
    const output = await runCli(['key_old', 'create', '--force'], id, false, '')
    expect(output).toContain('Private key saved in')
    const publicKeyPath = output.split('\n').find(val => val.includes('Public key saved in'))?.split(' ').at(-1)
    expect(publicKeyPath).toBeDefined()
  })

  it('test upload bundle with auto encryption ', async () => {
    semver = getSemver(semver)

    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], id, false)
    expect(output2).toContain('Time to share your update to the world')
    expect(output2).toContain('Encrypting your bundle')

    const privateKey = readFileSync(join(tempFileFolder(id), '.capgo_key'), 'utf-8')
    expect(privateKey).toContain('PRIVATE KEY')

    await checkEncryption(output2, privateKey)
  })
  it('test upload bundle with custom key data ', async () => {
    const publicKeyFile = readFileSync(join(tempFileFolder(id), '.capgo_key.pub'), 'utf-8')
    const privateKey = readFileSync(join(tempFileFolder(id), '.capgo_key'), 'utf-8')
    semver = getSemver(semver)
    const output4 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--key-data', `'${publicKeyFile}'`], id, false)
    expect(output4).toContain('Time to share your update to the world')
    expect(output4).toContain('Encrypting your bundle')

    await checkEncryption(output4, privateKey)
  })
  it('test upload bundle with custom key path ', async () => {
    const privateKey = readFileSync(join(tempFileFolder(id), '.capgo_key'), 'utf-8')

    // test with key data
    const publicKeyFile = readFileSync(join(tempFileFolder(id), '.capgo_key.pub'), 'utf-8')
    expect(publicKeyFile).toContain('PUBLIC KEY')

    renameSync(join(tempFileFolder(id), '.capgo_key.pub'), join(tempFileFolder(id), 'wierd_file'))
    rmSync(join(tempFileFolder(id), '.capgo_key'))

    semver = getSemver(semver)

    const output3 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--key', 'wierd_file'], id, false)
    expect(output3).toContain('Time to share your update to the world')
    expect(output3).toContain('Encrypting your bundle')

    await checkEncryption(output3, privateKey)
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

  it('test upload without encryption OLD', async () => {
    const output = await runCli(['key_old', 'create', '--force'], id, false, '')
    expect(output).toContain('Public key saved in')

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
