import { Client } from 'minio'

const minioClient = new Client({
  endPoint: '9ee3d7479a3c359681e3fab2c8cb22c0.r2.cloudflarestorage.com',
  port: 9000,
  useSSL: true,
  accessKey: 'c6b010bf628feed2cab177fb7fd76a38',
  secretKey: '4464c1d35185d878b13234caf2bde4f3fd1721c810be56a5f137e126c600e768',
})

minioClient.presignedPutObject
