import { S3Client } from '@bradenmacdonald/s3-lite-client'

async function testS3Size() {
  const filePath = 'orgs/***/apps/ee.forgr.capacitor_go/12.8.5.zip'

  try {
    const client = new S3Client({
      endPoint: 'https://***.r2.cloudflarestorage.com',
      accessKey: '***',
      pathStyle: true,
      secretKey: '***',
      region: 'auto',
      bucket: 'capgo',
    })

    console.log('Testing S3 size for path:', filePath)

    const file = await client.statObject(filePath)
    const size = file.size ?? 0

    console.log('File size:', size, 'bytes')
    console.log('File size:', (size / 1024 / 1024).toFixed(2), 'MB')

    if (size === 0) {
      console.log('File might not exist or has 0 size')
    }
  }
  catch (error) {
    console.error('Error testing S3 size:', error)
  }
}

// Run the test
testS3Size()
