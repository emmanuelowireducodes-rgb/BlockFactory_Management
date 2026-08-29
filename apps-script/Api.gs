function doGet(e) {
  return handleApiRequest((e && e.parameter) || {})
}

function doPost(e) {
  try {
    var contents = e && e.postData && e.postData.contents
    if (!contents) throw apiError('INVALID_REQUEST', 'A JSON request body is required.')
    var request = JSON.parse(contents)
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw apiError('INVALID_REQUEST', 'The request body must be a JSON object.')
    }
    return handleApiRequest(request)
  } catch (error) {
    return toErrorResponse(error)
  }
}

function handleApiRequest(request) {
  try {
    var action = String(request.action || '')
    if (!action) throw apiError('ACTION_REQUIRED', 'An API action is required.')

    var handlers = {
      health: health,
      getCompanies: getCompanies,
      getAccess: getAccess,
      getCompanyFeatures: getCompanyFeatures,
      setCompanyFeature: setCompanyFeature,
      getRoles: getRoles,
      createRole: createRole,
      updateRole: updateRole,
      deleteRole: deleteRole,
      login: login,
      createCompany: createCompany,
      createUser: createUser,
      getUsers: getUsers,
      resetPassword: resetPassword,
      setUserActive: setUserActive,
      updateUser: updateUser,
      getProducts: getProducts,
      createProduct: createProduct,
      updateProduct: updateProduct,
      deactivateProduct: deactivateProduct,
      getProduction: getProduction,
      createProduction: createProduction,
      cancelProduction: cancelProduction,
      getInventory: getInventory,
      getInventoryTransactions: getInventoryTransactions,
      createOpeningStock: createOpeningStock,
      getSales: getSales,
      createSale: createSale,
      getSale: getSale,
      getCustomerPayments: getCustomerPayments,
      createCustomerPayment: createCustomerPayment,
      getExpenses: getExpenses,
      createExpense: createExpense,
      getReportSummary: getReportSummary
    }
    if (!handlers[action]) throw apiError('UNKNOWN_ACTION', 'Unsupported API action: ' + action)
    return successResponse(handlers[action](request))
  } catch (error) {
    return toErrorResponse(error)
  }
}

function toErrorResponse(error) {
  console.error(error && error.stack ? error.stack : error)
  return errorResponse(error && error.apiCode ? error.apiCode : 'INTERNAL_ERROR', error && error.apiCode ? error.message : 'An unexpected server error occurred.')
}

function health() {
  return { status: 'ok', service: 'BlockFactory Management API' }
}

function login(request) {
  initializeDatabase()
  var username = normalizeUsername(request.username)
  var password = request.password
  if (!username || typeof password !== 'string' || !password) {
    throw apiError('INVALID_CREDENTIALS', 'Username and password are required.')
  }

  var user = findRecordByValue('USERS', 'Username', username)
  if (!user || !isActive(user.Active) || !verifyPassword(password, user['Password Hash'])) {
    throw apiError('INVALID_CREDENTIALS', 'Invalid username or password.')
  }
  return createSession(user)
}

function getCompanies(request) {
  var session = requireSession(request.token)
  requireRole(session, [APP_CONFIG.roles.SUPER_ADMIN])
  initializeDatabase()
  return getSheetRecords('COMPANIES').map(publicCompany)
}

function createCompany(request) {
  var session = requireSession(request.token)
  requireRole(session, [APP_CONFIG.roles.SUPER_ADMIN])
  var company = request.company || {}
  var requestId = requireText(request.requestId, 'requestId')
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var completed = getProperties().getProperty(APP_CONFIG.idempotencyPrefix + requestId)
    if (completed) return JSON.parse(completed)

    initializeDatabase()
    var companyName = requireText(company.companyName, 'companyName')
    var ownerName = requireText(company.ownerName, 'ownerName')
    var ownerUsername = normalizeUsername(company.ownerUsername)
    var ownerPassword = company.ownerPassword
    if (!ownerUsername) throw apiError('VALIDATION_ERROR', 'ownerUsername is required.')
    validatePassword(ownerPassword)
    if (findRecordByValue('USERS', 'Username', ownerUsername)) {
      throw apiError('DUPLICATE_USERNAME', 'That username is already in use.')
    }

    var companyId = nextId('COMPANIES', 'Company ID', 'FAC')
    var now = new Date().toISOString()
    var companyRecord = {
      'Company ID': companyId,
      'Company Name': companyName,
      'Owner Name': ownerName,
      'Phone': optionalText(company.phone),
      'Location': optionalText(company.location),
      'Status': 'ACTIVE',
      'Created At': now,
      'Created By': session.userId
    }
    appendRecord('COMPANIES', APP_CONFIG.companyHeaders, companyRecord)
    initializeAccessData()

    var owner = createUserRecord({
      companyId: companyId,
      name: ownerName,
      username: ownerUsername,
      password: ownerPassword,
      role: APP_CONFIG.roles.OWNER,
      createdAt: now
    })
    var result = { company: publicCompany(companyRecord), owner: publicUser(owner), sheets: Object.keys(APP_CONFIG.operationalSheetHeaders) }
    getProperties().setProperty(APP_CONFIG.idempotencyPrefix + requestId, JSON.stringify(result))
    return result
  } finally {
    lock.releaseLock()
  }
}

function createUser(request) {
  var session = requireSession(request.token)
  var user = request.user || {}

  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var companyId
    if (session.role === APP_CONFIG.roles.SUPER_ADMIN) {
      companyId = requireText(user.companyId, 'companyId')
      if (!findRecordByValue('COMPANIES', 'Company ID', companyId)) {
        throw apiError('COMPANY_NOT_FOUND', 'The requested company does not exist.')
      }
    } else if (session.role === APP_CONFIG.roles.OWNER) {
      companyId = requireCompanyContext(session)
      if (user.companyId && String(user.companyId) !== companyId) {
        throw apiError('FORBIDDEN', 'Company ID is determined by the authenticated session.')
      }
    } else {
      throw apiError('FORBIDDEN', 'You are not authorized to create users.')
    }

    initializeDatabase()
    requirePermission(session, companyId, 'DASHBOARD', 'MANAGE_USERS')
    var roleRecord = user.roleId ? findRecordByValue('ROLES', 'Role ID', user.roleId) : getSheetRecords('ROLES').filter(function (item) { return String(item['Company ID']) === String(companyId) && item['Role Name'] === String(user.role) })[0]
    if (!roleRecord || String(roleRecord['Company ID']) !== String(companyId) || !isTrue(roleRecord.Active)) throw apiError('VALIDATION_ERROR', 'A valid company role is required.')
    if (isTrue(roleRecord['System Role']) && roleRecord['Role Name'] === APP_CONFIG.roles.OWNER && session.role !== APP_CONFIG.roles.SUPER_ADMIN) throw apiError('FORBIDDEN', 'Owners cannot create another owner.')
    var role = roleRecord['Role Name']
    var username = normalizeUsername(user.username)
    if (!username) throw apiError('VALIDATION_ERROR', 'username is required.')
    if (findRecordByValue('USERS', 'Username', username)) throw apiError('DUPLICATE_USERNAME', 'That username is already in use.')
    var record = createUserRecord({
      companyId: companyId,
      name: requireText(user.name, 'name'),
      username: username,
      password: user.password,
      role: role,
      roleId: roleRecord['Role ID'],
      createdAt: new Date().toISOString()
    })
    return publicManagedUser(record)
  } finally {
    lock.releaseLock()
  }
}

function requireUserManager(session) {
  return session
}

function resolveUserManagementCompanyId(session, requestedCompanyId) {
  return resolveOperationalCompanyId(session, requestedCompanyId, true)
}

function publicManagedUser(record) {
  var role = record.Role
  if (record['Role ID']) {
    var roleRecord = findRecordByValue('ROLES', 'Role ID', record['Role ID'])
    if (roleRecord) role = roleRecord['Role Name']
  }
  return {
    userId: record['User ID'], companyId: record['Company ID'], name: record.Name, username: record.Username,
    role: role, roleId: record['Role ID'] || null, active: isActive(record.Active), createdAt: record['Created At'], updatedAt: record['Updated At']
  }
}

function requireManagedUser(session, userId, companyId) {
  var record = findRecordByValue('USERS', 'User ID', requireText(userId, 'userId'))
  if (!record) throw apiError('NOT_FOUND', 'The requested user was not found.')
  if (String(record['Company ID']) !== String(companyId)) throw apiError('FORBIDDEN', 'The requested user belongs to another company.')
  if (session.role === APP_CONFIG.roles.OWNER && record.Role === APP_CONFIG.roles.OWNER) {
    throw apiError('FORBIDDEN', 'Owners may not manage the company owner account.')
  }
  return record
}

function getUsers(request) {
  var session = requireSession(request.token)
  var companyId = resolveUserManagementCompanyId(session, request.companyId)
  initializeDatabase()
  requirePermission(session, companyId, 'DASHBOARD', 'MANAGE_USERS')
  return getSheetRecords('USERS').filter(function (record) {
    return String(record['Company ID']) === String(companyId)
  }).map(publicManagedUser)
}

function resetPassword(request) {
  var session = requireSession(request.token)
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var companyId = resolveUserManagementCompanyId(session, request.companyId)
    initializeDatabase()
    requirePermission(session, companyId, 'DASHBOARD', 'MANAGE_USERS')
    var record = requireManagedUser(session, request.userId, companyId)
    validatePassword(request.newPassword)
    record['Password Hash'] = hashPassword(request.newPassword)
    record['Updated At'] = new Date().toISOString()
    updateRecordByValue('USERS', APP_CONFIG.userHeaders, 'User ID', record['User ID'], record)
    return publicManagedUser(record)
  } finally {
    lock.releaseLock()
  }
}

function setUserActive(request) {
  var session = requireSession(request.token)
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var companyId = resolveUserManagementCompanyId(session, request.companyId)
    initializeDatabase()
    requirePermission(session, companyId, 'DASHBOARD', 'MANAGE_USERS')
    var record = requireManagedUser(session, request.userId, companyId)
    if (String(record['User ID']) === String(session.userId) && !requireBoolean(request.active, 'active')) {
      throw apiError('FORBIDDEN', 'You cannot deactivate your own account.')
    }
    record.Active = requireBoolean(request.active, 'active')
    record['Updated At'] = new Date().toISOString()
    updateRecordByValue('USERS', APP_CONFIG.userHeaders, 'User ID', record['User ID'], record)
    return publicManagedUser(record)
  } finally {
    lock.releaseLock()
  }
}

function updateUser(request) {
  var session = requireSession(request.token)
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var companyId = resolveUserManagementCompanyId(session, request.companyId)
    initializeDatabase()
    requirePermission(session, companyId, 'DASHBOARD', 'MANAGE_USERS')
    var input = request.user || {}
    var record = requireManagedUser(session, input.userId || request.userId, companyId)
    var roleRecord = findRecordByValue('ROLES', 'Role ID', input.roleId)
    if (!roleRecord || String(roleRecord['Company ID']) !== String(companyId) || !isTrue(roleRecord.Active)) throw apiError('VALIDATION_ERROR', 'A valid company role is required.')
    if (isTrue(roleRecord['System Role']) && roleRecord['Role Name'] === APP_CONFIG.roles.OWNER && session.role !== APP_CONFIG.roles.SUPER_ADMIN) throw apiError('FORBIDDEN', 'Owners cannot assign the owner role.')
    if (input.name !== undefined) record.Name = requireText(input.name, 'name')
    if (input.username !== undefined) {
      record.Username = normalizeUsername(input.username)
      if (getSheetRecords('USERS').some(function (item) { return item['User ID'] !== record['User ID'] && item.Username === record.Username })) throw apiError('DUPLICATE_USERNAME', 'That username is already in use.')
    }
    if (input.password) record['Password Hash'] = hashPassword(input.password)
    record.Role = roleRecord['Role Name']
    record['Role ID'] = roleRecord['Role ID']
    record['Updated At'] = new Date().toISOString()
    updateRecordByValue('USERS', APP_CONFIG.userHeaders, 'User ID', record['User ID'], record)
    return publicManagedUser(record)
  } finally {
    lock.releaseLock()
  }
}

function requireBoolean(value, fieldName) {
  if (value !== true && value !== false) throw apiError('VALIDATION_ERROR', fieldName + ' must be true or false.')
  return value
}

function createUserRecord(input) {
  validatePassword(input.password)
  var userId = nextId('USERS', 'User ID', 'USR')
  var record = {
    'User ID': userId,
    'Company ID': input.companyId,
    'Name': input.name,
    'Username': input.username,
    'Password Hash': hashPassword(input.password),
    'Role': input.role,
    'Active': true,
    'Created At': input.createdAt,
    'Updated At': input.createdAt
  }
  record['Role ID'] = input.roleId || ''
  appendRecord('USERS', APP_CONFIG.userHeaders, record)
  return record
}

function publicCompany(record) {
  return {
    companyId: record['Company ID'], companyName: record['Company Name'], ownerName: record['Owner Name'],
    phone: record.Phone, location: record.Location, status: record.Status, createdAt: record['Created At']
  }
}

function normalizeUsername(value) {
  return optionalText(value).toLowerCase()
}

function optionalText(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function requireText(value, fieldName) {
  var result = optionalText(value)
  if (!result) throw apiError('VALIDATION_ERROR', fieldName + ' is required.')
  return result
}

function isActive(value) {
  return value === true || String(value).toUpperCase() === 'TRUE' || String(value).toUpperCase() === 'ACTIVE'
}
