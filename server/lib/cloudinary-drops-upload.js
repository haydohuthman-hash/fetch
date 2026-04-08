import { v2 as cloudinary } from 'cloudinary'
import { isCloudinaryConfigured } from './cloudinary-product-upload.js'

function configureCloudinary() {
  cloudinary.config({
    cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    api_key: (process.env.CLOUDINARY_API_KEY || '').trim(),
    api_secret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
    secure: true,
  })
}

/**
 * @param {Buffer} buffer
 * @param {string} [_mimetype]
 * @returns {Promise<string>} https secure_url
 */
export async function uploadDropVideoBuffer(buffer, _mimetype) {
  if (!isCloudinaryConfigured()) {
    throw new Error('cloudinary_not_configured')
  }
  configureCloudinary()
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'fetch-drops/videos', resource_type: 'video' },
      (err, result) => {
        if (err) reject(err)
        else if (!result?.secure_url) reject(new Error('cloudinary_no_url'))
        else resolve(String(result.secure_url))
      },
    )
    stream.end(buffer)
  })
}

/**
 * @param {Buffer} buffer
 * @param {string} [_mimetype]
 * @returns {Promise<string>} https secure_url
 */
export async function uploadDropImageBuffer(buffer, _mimetype) {
  if (!isCloudinaryConfigured()) {
    throw new Error('cloudinary_not_configured')
  }
  configureCloudinary()
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'fetch-drops/images', resource_type: 'image' },
      (err, result) => {
        if (err) reject(err)
        else if (!result?.secure_url) reject(new Error('cloudinary_no_url'))
        else resolve(String(result.secure_url))
      },
    )
    stream.end(buffer)
  })
}
