import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prepareCli, runCli, setDependencies, tempFileFolder } from './cli-utils'
import { getSupabaseClient, getUpdate, getUpdateBaseData, resetAndSeedAppData, responseOk } from './test-utils'

let semver = `1.0.${Date.now()}`
const APPNAME = 'com.demo.app.cli'

function increaseSemver() {
  const lastNumber = Number.parseInt(semver.charAt(semver.length - 1))
  const newSemver = `${semver.slice(0, -1)}${(lastNumber + 1).toString()}`
  semver = newSemver
}

describe('test key generation', () => {
  beforeEach(async () => {
    await prepareCli(APPNAME)
  })
  it('test old key generation', async () => {
  // set the key to an empty string. Otherwise runCli will not work
    const output = await runCli(['key_old', 'create', '--force'], true, '')
    expect(output).toContain('Private key saved in')
    const publicKeyPath = output.split('\n').find(val => val.includes('Public key saved in'))?.split(' ').at(-1)
    expect(publicKeyPath).toBeDefined()

    const publicKeyFinalPath = path.join(tempFileFolder, publicKeyPath!)
    expect(fs.existsSync(publicKeyFinalPath!)).toBe(true)
    const keyData = fs.readFileSync(publicKeyFinalPath, 'utf-8')
    expect(keyData).toBeTruthy()
    expect(keyData.length).toBeGreaterThan(1)
    expect(keyData).include('PUBLIC KEY')

    const privateKeyFinalPath = path.join(tempFileFolder, publicKeyPath!).replace('.pub', '')
    expect(fs.existsSync(privateKeyFinalPath!)).toBe(true)
    const privateKeyData = fs.readFileSync(privateKeyFinalPath, 'utf-8')
    expect(privateKeyData).toBeTruthy()
    expect(privateKeyData.length).toBeGreaterThan(1)
    expect(privateKeyData).include('PRIVATE KEY')
  })

  it('test new key generation', async () => {
    // set the key to an empty string. Otherwise runCli will not work
    const output = await runCli(['key', 'create', '--force'], true, '')
    expect(output).toContain('Private key saved in')
    const privateKeyPath = output.split('\n').find(val => val.includes('Private key saved in'))?.split(' ').at(-1)
    expect(privateKeyPath).toBeDefined()

    const privateKeyFinalPath = path.join(tempFileFolder, privateKeyPath!)
    expect(fs.existsSync(privateKeyFinalPath!)).toBe(true)
    const keyData = fs.readFileSync(privateKeyFinalPath, 'utf-8')
    expect(keyData).toBeTruthy()
    expect(keyData.length).toBeGreaterThan(1)
    expect(keyData).include('PRIVATE KEY')

    const publicKeyFinalPath = `${privateKeyFinalPath}.pub`
    expect(fs.existsSync(publicKeyFinalPath!)).toBe(true)
    const publicKeyData = fs.readFileSync(publicKeyFinalPath, 'utf-8')
    expect(publicKeyData).toBeTruthy()
    expect(publicKeyData.length).toBeGreaterThan(1)
    expect(publicKeyData).include('PUBLIC KEY')
  })
})

describe('tests CLI upload', () => {
  beforeAll(async () => {
    await prepareCli(APPNAME)
  })
  it('should upload bundle successfully', async () => {
    await resetAndSeedAppData(APPNAME)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], true)
    expect(output).toContain('Bundle uploaded')
  })
  it('should download and verify uploaded bundle', async () => {
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

    const indexJsEntry = zipEntries.find(entry => entry.entryName.includes('index.js'))
    expect(indexJsEntry).toBeDefined()

    const indexJsContent = indexJsEntry!.getData().toString('utf8')
    expect(indexJsContent).toBe('import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log(\"Hello world!!!\");\nCapacitorUpdater.notifyAppReady();')
  })
  it('should not upload same twice', async () => {
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false)
    expect(output).toContain('Cannot upload the same bundle content')
  })
  it ('should not upload same hash twice', async () => {
    await resetAndSeedAppData(APPNAME)
    increaseSemver()
    await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], false)
    increaseSemver()

    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], false)
    expect(output).toContain('Cannot upload the same bundle content')
  })
  it ('should upload an external bundle', async () => {
    await resetAndSeedAppData(APPNAME)
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--external', 'https://example.com'], false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()

    expect(error).toBeNull()
    expect(data?.external_url).toBe('https://example.com')
  })
  it('test --iv-session-key with cloud upload', async () => {
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--iv-session-key', 'aaa:bbb'], false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()

    expect(error).toBeNull()
    expect(data?.session_key).toBeNull()
  })
  it('test --iv-session-key with external upload', async () => {
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--iv-session-key', 'aaa:bbb', '--external', 'https://example.com'], false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()

    expect(error).toBeNull()
    expect(data?.session_key).toBe('aaa:bbb')
  })
  it('test --encrypted-checksum with cloud upload', async () => {
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--encrypted-checksum', 'aaaa'], false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()

    expect(error).toBeNull()
    expect(data?.checksum).not.toBe('aaaa')
  })
  it('test --min-update-version', async () => {
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--min-update-version', '1.0.0', '--ignore-checksum-check'], false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()

    expect(error).toBeNull()
    expect(data?.minUpdateVersion).not.toBe('1.0.0')
  })
  it('test --encrypted-checksum with external upload', async () => {
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--encrypted-checksum', 'aaaa', '--external', 'https://example.com'], false)
    expect(output).toContain('Time to share your update to the world')

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()

    expect(error).toBeNull()
    expect(data?.checksum).toBe('aaaa')
  })

  // TODO: Wait for PR of CLI relreased
  it('test custom key upload and download (old)', async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)

    const output = await runCli(['key_old', 'create', '--force'], true, '')
    expect(output).toContain('Private key saved in')
    const publicKeyPath = output.split('\n').find(val => val.includes('Public key saved in'))?.split(' ').at(-1)
    expect(publicKeyPath).toBeDefined()

    increaseSemver()
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false)
    expect(output2).toContain('Time to share your update to the world')
    expect(output2).toContain('Encrypting your bundle')

    const privateKey = fs.readFileSync(path.join(tempFileFolder, '.capgo_key'), 'utf-8')
    expect(privateKey).toContain('PRIVATE KEY')

    async function checkEncryption(output2: string, privateKey: string) {
      const checksum = output2.split('\n').find(line => line.includes('Checksum'))?.split(' ').at(-1)
      expect(checksum).toBeDefined()
      expect(checksum?.length).toBe(8)

      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .eq('name', semver)
        .eq('app_id', APPNAME)
        .single()

      expect(error).toBeNull()
      expect(data?.checksum).toBe(checksum)
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

      const aesKey = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Uint8Array.from(encryptedBuffer),
      )
      expect(aesKey.length).toBe(16)

      // The Initialization Vector (IV) used during encryption (16 bytes for AES)
      const iv = Buffer.from(ivStr!, 'base64')
      expect(iv.length).greaterThan(0)

      const decipher = crypto.createDecipheriv('aes-128-cbc', Uint8Array.from(aesKey), Uint8Array.from(iv))
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

    await checkEncryption(output2, privateKey)

    // test with key data
    const publicKeyFile = fs.readFileSync(path.join(tempFileFolder, '.capgo_key.pub'), 'utf-8')
    expect(publicKeyFile).toContain('PUBLIC KEY')

    fs.renameSync(path.join(tempFileFolder, '.capgo_key.pub'), path.join(tempFileFolder, 'wierd_file'))
    fs.rmSync(path.join(tempFileFolder, '.capgo_key'))

    increaseSemver()
    const output3 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--key', 'wierd_file'], false)
    expect(output3).toContain('Time to share your update to the world')
    expect(output3).toContain('Encrypting your bundle')

    await checkEncryption(output3, privateKey)

    increaseSemver()
    const output4 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--key-data', `'${publicKeyFile}'`], false)
    expect(output4).toContain('Time to share your update to the world')
    expect(output4).toContain('Encrypting your bundle')

    await checkEncryption(output4, privateKey)
  })

  it('test custom key upload and download (new)', async () => {
    await resetAndSeedAppData(APPNAME)
    await prepareCli(APPNAME)

    const output = await runCli(['key', 'create', '--force'], true, '')
    expect(output).toContain('Private key saved in')
    const privateKeyPath = output.split('\n').find(val => val.includes('Private key saved in'))?.split(' ').at(-1)
    expect(privateKeyPath).toBeDefined()

    const publicKeyFile = fs.readFileSync(path.join(tempFileFolder, '.capgo_key_v2.pub'), 'utf-8')
    expect(publicKeyFile).toBeTruthy()
    expect(publicKeyFile).toContain('PUBLIC KEY')

    increaseSemver()
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false)
    expect(output2).toContain('Time to share your update to the world')
    expect(output2).toContain('Encrypting your bundle')

    async function testEncryption(publicKey: string, output2: string) {
      const checksum = output2.split('\n').find(line => line.includes('Checksum'))?.split(' ').at(-1)
      expect(checksum).toBeDefined()
      expect(checksum?.length).toBe(64)

      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .eq('name', semver)
        .eq('app_id', APPNAME)
        .single()

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
      const aesKey = crypto.publicDecrypt(publicKey, new Uint8Array(encryptedBuffer))
      expect(aesKey.length).toBe(16)

      // The Initialization Vector (IV) used during encryption (16 bytes for AES)
      const iv = Buffer.from(ivStr!, 'base64')
      expect(iv.length).greaterThan(0)

      const decipher = crypto.createDecipheriv('aes-128-cbc', Uint8Array.from(aesKey), Uint8Array.from(iv))
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
      const hash = crypto.createHash('sha256')

      // Update the hash with your buffer data
      hash.update(new Uint8Array(decrypted))

      // Compute the hash digest in hexadecimal format
      const calculatedSha256Hash = hash.digest('hex')
      expect(calculatedSha256Hash).toBe(checksum)

      const decryptedChecksum = crypto.publicDecrypt(publicKey, new Uint8Array(Buffer.from(data!.checksum!, 'base64')))
      const decryptedChecksumStr = decryptedChecksum.toString('base64')
      expect(decryptedChecksumStr).toBe(calculatedSha256Hash)
      expect(decryptedChecksumStr).toBe(checksum) // redundent, but I will keep it
    }

    await testEncryption(publicKeyFile, output2)

    // test with key data
    const privateKeyFile = fs.readFileSync(path.join(tempFileFolder, '.capgo_key_v2'), 'utf-8')
    expect(privateKeyFile).toContain('PRIVATE KEY')

    fs.renameSync(path.join(tempFileFolder, '.capgo_key_v2'), path.join(tempFileFolder, 'wierd_file'))
    fs.rmSync(path.join(tempFileFolder, '.capgo_key_v2.pub'))

    increaseSemver()
    const output3 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--key-v2', 'wierd_file'], false)
    expect(output3).toContain('Time to share your update to the world')
    expect(output3).toContain('Encrypting your bundle')

    await testEncryption(privateKeyFile, output3)

    increaseSemver()
    const output4 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--ignore-checksum-check', '--key-data-v2', `'${privateKeyFile}'`], false)
    expect(output4).toContain('Time to share your update to the world')
    expect(output4).toContain('Encrypting your bundle')

    await testEncryption(privateKeyFile, output4)
  })

  it('test upload without encryption (new)', async () => {
    await prepareCli(APPNAME)

    const output = await runCli(['key', 'create', '--force'], true, '')
    expect(output).toContain('Private key saved in')
    const privateKeyPath = output.split('\n').find(val => val.includes('Private key saved in'))?.split(' ').at(-1)
    expect(privateKeyPath).toBeDefined()

    const publicKeyFile = fs.readFileSync(path.join(tempFileFolder, '.capgo_key_v2.pub'), 'utf-8')
    expect(publicKeyFile).toBeTruthy()
    expect(publicKeyFile).toContain('PUBLIC KEY')

    increaseSemver()
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--no-key'], false)
    expect(output2).toContain('Time to share your update to the world')
    expect(output2).not.toContain('Encrypting your bundle')

    const checksum = output2.split('\n').find(line => line.includes('Checksum'))?.split(' ').at(-1)
    expect(checksum).toBeDefined()
    expect(checksum?.length).toBe(8)

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .single()

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

  it('test upload without encryption (old)', async () => {
    await prepareCli(APPNAME)

    const output = await runCli(['key_old', 'create', '--force'], true, '')
    expect(output).toContain('Public key saved in')

    increaseSemver()
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--no-key'], false)
    expect(output2).toContain('Time to share your update to the world')
    expect(output2).not.toContain('Encrypting your bundle')

    const checksum = output2.split('\n').find(line => line.includes('Checksum'))?.split(' ').at(-1)
    expect(checksum).toBeDefined()
    expect(checksum?.length).toBe(8)

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('name', semver)
      .eq('app_id', APPNAME)
      .single()

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

  it('test code check (missing notifyAppReady)', async () => {
    await prepareCli(APPNAME)
    fs.writeFileSync(path.join(tempFileFolder, 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");')
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false)
    expect(output).toContain('notifyAppReady() is missing in')
  })
  it('test code check (missing index.html)', async () => {
    await prepareCli(APPNAME)
    fs.rmSync(path.join(tempFileFolder, 'dist', 'index.html'))
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false)
    expect(output).toContain('index.html is missing')
  })
  it('test --no-code-check', async () => {
    await prepareCli(APPNAME)
    fs.rmSync(path.join(tempFileFolder, 'dist', 'index.html'))
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check', '--no-code-check'], false)
    expect(output).toContain('Time to share your update to the world')
  })
})

describe('tests Wrong cases', () => {
  beforeAll(async () => {
    await prepareCli(APPNAME)
  })
  it('cannot upload with wrong api key', async () => {
    const testApiKey = crypto.randomUUID()

    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false, testApiKey)
    expect(output).toContain('Invalid API key or insufficient permissions.')
  })

  it('should test selectable disallow upload', async () => {
    const supabase = getSupabaseClient()
    increaseSemver()
    await supabase.from('channels').update({ disable_auto_update: 'version_number' }).eq('name', 'production').eq('app_id', APPNAME)
    // test if is set correctly
    const { data: channel } = await supabase.from('channels').select('*').eq('name', 'production').eq('app_id', APPNAME).single()
    expect(channel?.disable_auto_update).toBe('version_number')

    try {
      const output1 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'])
      expect(output1).toContain('to provide a min-update-version')

      const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--min-update-version', 'invalid', '--ignore-metadata-check'])
      expect(output2).toContain('should follow semver convention')
    }
    finally {
      await supabase.from('channels').update({ disable_auto_update: 'major' }).eq('name', 'production').eq('app_id', APPNAME)
    }
  })
})

describe('tests CLI for organization', () => {
  beforeAll(async () => {
    await prepareCli(APPNAME)
  })

  // todo: fix this test
  it('should test auto min version flag', async () => {
    await resetAndSeedAppData(APPNAME)
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('app_versions').update({ min_update_version: '1.0.0' }).eq('name', '1.0.0').eq('app_id', APPNAME)
    expect(error).toBeNull()
    const uploadWithAutoFlagWithAssert = async (expected: string) => {
      const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'])
      console.log(output)
      const min_update_version = output.split('\n').find(l => l.includes('Auto set min-update-version'))
      expect(min_update_version).toBeDefined()
      expect(min_update_version).toContain(expected)
      return output
    }

    increaseSemver()
    await uploadWithAutoFlagWithAssert(semver)

    const expected = semver
    increaseSemver()
    await uploadWithAutoFlagWithAssert(expected)
    await supabase
      .from('app_versions')
      .update({ min_update_version: null })
      .eq('name', semver)

    // this CLI uplaod won't actually succeed.
    // After increaseSemver, setting the min_update_version and native_packages will required the previous semver
    const prevSemver = semver
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'])
    expect(output).toContain('skipping auto setting compatibility')

    const { error: error2 } = await supabase
      .from('app_versions')
      .update({ min_update_version: null, native_packages: null })
      .eq('name', prevSemver)
    expect(error2).toBeNull()

    increaseSemver()
    const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'])
    expect(output2).toContain('it\'s your first upload with compatibility check')
  })

  it('should test upload with organization', async () => {
    const testApiKey = crypto.randomUUID()
    const testUserId = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
    const supabase = getSupabaseClient()
    await resetAndSeedAppData(APPNAME)
    await supabase.from('apikeys')
      .insert({ key: testApiKey, user_id: testUserId, mode: 'upload', name: 'test' })

    try {
      const { data: orgMembers } = await supabase.from('org_users')
        .delete()
        .eq('user_id', testUserId)
        .select('*')

      try {
        await supabase.from('org_users')
          .insert({ user_id: testUserId, org_id: '046a36ac-e03c-4590-9257-bd6c9dba9ee8', user_right: 'upload' })

        try {
          increaseSemver()
          const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false, testApiKey)
          expect(output).toContain('Bundle uploaded')
        }
        finally {
          await supabase.from('org_users')
            .delete()
            .eq('user_id', testUserId)
            .eq('org_id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
            .eq('user_right', 'upload')
        }
      }
      finally {
        await supabase.from('org_users').insert(orgMembers!)
      }
    }
    finally {
      await supabase.from('apikeys')
        .delete()
        .eq('key', testApiKey)
        .eq('user_id', testUserId)
    }
  })
})

describe('tests CLI metadata', () => {
  beforeAll(async () => {
    await prepareCli(APPNAME)
  })

  it('should test compatibility table', async () => {
    await resetAndSeedAppData(APPNAME)
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], true)
    expect(output).toContain('Bundle uploaded')

    const assertCompatibilityTableColumns = async (column1: string, column2: string, column3: string, column4: string) => {
      const output = await runCli(['bundle', 'compatibility', '-c', 'production'])
      const androidPackage = output.split('\n').find(l => l.includes('@capacitor/android'))
      expect(androidPackage).toBeDefined()

      const columns = androidPackage!.split('│').slice(2, -1)
      expect(columns.length).toBe(4)
      expect(columns[0]).toContain(column1)
      expect(columns[1]).toContain(column2)
      expect(columns[2]).toContain(column3)
      expect(columns[3]).toContain(column4)
    }

    // await assertCompatibilityTableColumns('@capacitor/android', '4.5.0', 'None', '❌')

    // increaseSemver()
    await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'])

    await assertCompatibilityTableColumns('@capacitor/android', '4.5.0', '4.5.0', '✅')

    setDependencies({})

    // well, the local version doesn't exist, so I expect an empty string ???
    await assertCompatibilityTableColumns('@capacitor/android', '', '4.5.0', '❌')
  })
})
