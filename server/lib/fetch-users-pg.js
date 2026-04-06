import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10

/**
 * @param {import('pg').Pool} pool
 */
export async function ensureFetchUsersTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fetch_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      display_name text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ email: string, password: string, displayName: string }} input
 */
export async function registerFetchUser(pool, input) {
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const displayName = input.displayName.trim().slice(0, 120)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'invalid_email' }
  }
  if (password.length < 8) {
    return { ok: false, error: 'password_too_short' }
  }
  if (displayName.length < 2) {
    return { ok: false, error: 'display_name_required' }
  }
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  try {
    const { rows } = await pool.query(
      `INSERT INTO fetch_users (email, password_hash, display_name) VALUES ($1, $2, $3)
       RETURNING id, email, display_name, created_at`,
      [email, password_hash, displayName],
    )
    return { ok: true, user: rows[0] }
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
      return { ok: false, error: 'email_taken' }
    }
    throw e
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function loginFetchUser(pool, emailRaw, password) {
  const email = emailRaw.trim().toLowerCase()
  if (!email || !password) {
    return { ok: false, error: 'invalid_credentials' }
  }
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, display_name FROM fetch_users WHERE email = $1`,
    [email],
  )
  const row = rows[0]
  if (!row) {
    return { ok: false, error: 'invalid_credentials' }
  }
  const ok = await bcrypt.compare(password, row.password_hash)
  if (!ok) {
    return { ok: false, error: 'invalid_credentials' }
  }
  return {
    ok: true,
    user: { id: row.id, email: row.email, display_name: row.display_name },
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function getFetchUserById(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, created_at FROM fetch_users WHERE id = $1`,
    [userId],
  )
  return rows[0] ?? null
}
