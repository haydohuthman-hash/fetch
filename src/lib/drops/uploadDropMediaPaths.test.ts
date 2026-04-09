import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveObjectPathInBucket, sanitizeFileName, userIdFromEmail } from './uploadDropMediaPaths'

test('userIdFromEmail: anon when no email', () => {
  assert.equal(userIdFromEmail(undefined), 'anon')
  assert.equal(userIdFromEmail(null), 'anon')
  assert.equal(userIdFromEmail(''), 'anon')
  assert.equal(userIdFromEmail('   '), 'anon')
})

test('userIdFromEmail: signed-in normalizes like account ids', () => {
  assert.equal(userIdFromEmail('User+tag@Example.com'), 'user_tag_example_com')
  assert.equal(userIdFromEmail('a@b.co'), 'a_b_co')
})

test('sanitizeFileName: last segment, unsafe chars, max 180', () => {
  assert.equal(sanitizeFileName('clip.mp4'), 'clip.mp4')
  assert.equal(sanitizeFileName('C:\\fake\\weird name!.mp4'), 'weird_name_.mp4')
  assert.equal(sanitizeFileName('../../../etc/passwd'), 'passwd')
  const long = 'a'.repeat(200) + '.jpg'
  assert.equal(sanitizeFileName(long).length, 180)
})

test('resolveObjectPathInBucket: prefers data.path', () => {
  assert.equal(
    resolveObjectPathInBucket('drops', { path: 'u/1-vid.mp4', fullPath: 'drops/other' }, 'fallback/x'),
    'u/1-vid.mp4',
  )
})

test('resolveObjectPathInBucket: fullPath strips bucket prefix', () => {
  assert.equal(
    resolveObjectPathInBucket('drops', { fullPath: 'drops/anon/123-photo.jpg' }, 'anon/999-f.jpg'),
    'anon/123-photo.jpg',
  )
})

test('resolveObjectPathInBucket: fullPath without bucket prefix unchanged (regex no match)', () => {
  assert.equal(
    resolveObjectPathInBucket('drops', { fullPath: 'anon/only-key.png' }, 'anon/999-f.png'),
    'anon/only-key.png',
  )
})

test('resolveObjectPathInBucket: neither path nor fullPath → fallback (client-generated filePath)', () => {
  assert.equal(resolveObjectPathInBucket('drops', null, 'anon/1700000000000-vid.mp4'), 'anon/1700000000000-vid.mp4')
  assert.equal(resolveObjectPathInBucket('drops', {}, 'anon/1700000000000-vid.mp4'), 'anon/1700000000000-vid.mp4')
})

test('resolveObjectPathInBucket: bucket name with regex chars is escaped', () => {
  const bucket = 'drops.v1'
  assert.equal(
    resolveObjectPathInBucket(bucket, { fullPath: 'drops.v1/user/a.png' }, 'user/b.png'),
    'user/a.png',
  )
})
