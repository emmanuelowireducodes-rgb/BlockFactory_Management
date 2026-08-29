function getPasswordPepper() {
  var pepper = getProperties().getProperty(APP_CONFIG.passwordPepperProperty)
  if (!pepper) throw apiError('SECURITY_NOT_CONFIGURED', 'PASSWORD_PEPPER has not been configured.')
  return pepper
}

function bytesToBase64(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '')
}

function base64ToBytes(value) {
  return Utilities.base64DecodeWebSafe(value)
}

function secureEquals(left, right) {
  if (!left || !right || left.length !== right.length) return false
  var result = 0
  for (var index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

function derivePasswordHash(password, salt, iterations) {
  var material = Utilities.newBlob(String(password) + getPasswordPepper()).getBytes()
  var key = Utilities.newBlob(String(salt)).getBytes()
  var derived = Utilities.computeHmacSha256Signature(material, key)
  for (var round = 1; round < iterations; round += 1) derived = Utilities.computeHmacSha256Signature(derived, key)
  return bytesToBase64(derived)
}

function hashPassword(password) {
  validatePassword(password)
  var salt = Utilities.getUuid().replace(/-/g, '')
  return ['pbkdf2-hmac-sha256', APP_CONFIG.passwordIterations, salt, derivePasswordHash(password, salt, APP_CONFIG.passwordIterations)].join('$')
}

function verifyPassword(password, storedHash) {
  var parts = String(storedHash || '').split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-hmac-sha256') return false
  var iterations = Number(parts[1])
  if (!iterations || !parts[2] || !parts[3]) return false
  return secureEquals(derivePasswordHash(password, parts[2], iterations), parts[3])
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) throw apiError('INVALID_PASSWORD', 'Password must contain at least 12 characters.')
}

function createSession(user) {
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '')
  var session = {
    userId: user['User ID'],
    companyId: user['Company ID'] || null,
    name: user.Name,
    role: user.Role,
    expiresAt: Date.now() + APP_CONFIG.sessionLifetimeSeconds * 1000
  }
  getProperties().setProperty(APP_CONFIG.sessionPrefix + token, JSON.stringify(session))
  return { token: token, user: publicUser(session) }
}

function requireSession(token) {
  if (!token) throw apiError('UNAUTHENTICATED', 'An authentication token is required.')
  var propertyKey = APP_CONFIG.sessionPrefix + token
  var serialized = getProperties().getProperty(propertyKey)
  if (!serialized) throw apiError('UNAUTHENTICATED', 'Session is invalid or expired.')
  var session = JSON.parse(serialized)
  if (Date.now() >= session.expiresAt) {
    getProperties().deleteProperty(propertyKey)
    throw apiError('UNAUTHENTICATED', 'Session is invalid or expired.')
  }
  return session
}

function requireRole(session, allowedRoles) {
  if (allowedRoles.indexOf(session.role) === -1) throw apiError('FORBIDDEN', 'You are not authorized to perform this action.')
  return session
}

function requireCompanyContext(session) {
  if (!session.companyId) throw apiError('COMPANY_CONTEXT_REQUIRED', 'This action requires a company-scoped user.')
  return session.companyId
}

function publicUser(user) {
  return { userId: user.userId || user['User ID'], companyId: user.companyId || user['Company ID'] || null, name: user.name || user.Name, role: user.role || user.Role }
}
