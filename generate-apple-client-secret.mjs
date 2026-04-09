import fs from 'node:fs'
import jwt from 'jsonwebtoken'

const CLIENT_ID = 'com.fetch.login'
const TEAM_ID = 'FWB36KJ59N'
const KEY_ID = '5458XZC222'
const PRIVATE_KEY_PATH = './AuthKey_5458XZC222.p8'

const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8')
const now = Math.floor(Date.now() / 1000)

const token = jwt.sign(
  {
    iss: TEAM_ID,
    iat: now,
    exp: now + 15777000,
    aud: 'https://appleid.apple.com',
    sub: CLIENT_ID,
  },
  privateKey,
  {
    algorithm: 'ES256',
    header: {
      alg: 'ES256',
      kid: KEY_ID,
    },
  },
)

console.log(token)