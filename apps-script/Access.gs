var FEATURE_PERMISSIONS = {
  DASHBOARD: 'VIEW_DASHBOARD', PRODUCTS: 'VIEW_PRODUCTS', SALES: 'VIEW_SALES', INVENTORY: 'VIEW_INVENTORY',
  PRODUCTION: 'VIEW_PRODUCTION', EXPENSES: 'VIEW_EXPENSES', CUSTOMER_PAYMENTS: 'VIEW_CUSTOMER_PAYMENTS', REPORTS: 'VIEW_REPORTS', CUSTOMERS: 'VIEW_CUSTOMERS'
}
var SECRETARY_PERMISSIONS = ['VIEW_DASHBOARD', 'VIEW_PRODUCTS', 'VIEW_SALES', 'CREATE_SALE', 'VIEW_INVENTORY', 'VIEW_PRODUCTION', 'CREATE_PRODUCTION', 'VIEW_EXPENSES', 'CREATE_EXPENSE', 'VIEW_CUSTOMER_PAYMENTS', 'CREATE_CUSTOMER_PAYMENT', 'VIEW_REPORTS']

function initializeAccessData() {
  var companies = getSheetRecords('COMPANIES')
  var roles = getSheetRecords('ROLES')
  var permissions = getSheetRecords('ROLE_PERMISSIONS')
  var features = getSheetRecords('COMPANY_FEATURES')
  var now = new Date().toISOString()
  companies.forEach(function (company) {
    var companyId = String(company['Company ID'])
    var owner = ensureSystemRole(companyId, 'OWNER', roles, permissions, now)
    var secretary = ensureSystemRole(companyId, 'SECRETARY', roles, permissions, now)
    ensureCompanyFeatures(companyId, features, now)
    migrateLegacyUsers(companyId, owner, secretary, now)
  })
}

function ensureSystemRole(companyId, roleName, roles, permissions, now) {
  var role = roles.filter(function (item) { return String(item['Company ID']) === companyId && item['Role Name'] === roleName })[0]
  if (!role) {
    role = { 'Role ID': nextId('ROLES', 'Role ID', 'ROL'), 'Company ID': companyId, 'Role Name': roleName, 'System Role': true, 'Active': true, 'Created At': now, 'Updated At': now, 'Created By': 'SYSTEM' }
    appendRecord('ROLES', APP_CONFIG.roleHeaders, role)
    roles.push(role)
  }
  var existing = permissions.filter(function (item) { return String(item['Role ID']) === String(role['Role ID']) }).map(function (item) { return item.Permission })
  var defaults = roleName === 'OWNER' ? APP_CONFIG.permissions : SECRETARY_PERMISSIONS
  defaults.forEach(function (permission) { if (existing.indexOf(permission) === -1) appendRecord('ROLE_PERMISSIONS', APP_CONFIG.rolePermissionHeaders, { 'Role ID': role['Role ID'], Permission: permission }) })
  return role
}

function ensureCompanyFeatures(companyId, features, now) {
  APP_CONFIG.features.forEach(function (feature) {
    if (!features.some(function (item) { return String(item['Company ID']) === companyId && item['Feature Key'] === feature })) {
      appendRecord('COMPANY_FEATURES', APP_CONFIG.companyFeatureHeaders, { 'Company ID': companyId, 'Feature Key': feature, 'Enabled': true, 'Updated At': now, 'Updated By': 'SYSTEM' })
    }
  })
}

function migrateLegacyUsers(companyId, owner, secretary, now) {
  getSheetRecords('USERS').filter(function (user) { return String(user['Company ID']) === companyId }).forEach(function (user) {
    if (user['Role ID']) return
    var role = user.Role === APP_CONFIG.roles.OWNER ? owner : secretary
    user['Role ID'] = role['Role ID']
    updateRecordByValue('USERS', APP_CONFIG.userHeaders, 'User ID', user['User ID'], user)
  })
}

function companyFeatureEnabled(companyId, feature) {
  if (feature === 'DASHBOARD') return true
  var row = getSheetRecords('COMPANY_FEATURES').filter(function (item) { return String(item['Company ID']) === String(companyId) && item['Feature Key'] === feature })[0]
  return !row || isTrue(row.Enabled)
}

function requireFeature(session, companyId, feature) {
  if (session.role === APP_CONFIG.roles.SUPER_ADMIN || !companyId) return
  if (!companyFeatureEnabled(companyId, feature)) throw apiError('FEATURE_DISABLED', 'This feature is not enabled for the company.')
}

function userPermissions(session) {
  if (session.role === APP_CONFIG.roles.SUPER_ADMIN) return APP_CONFIG.permissions
  var user = findRecordByValue('USERS', 'User ID', session.userId)
  var roleId = user && user['Role ID']
  if (!roleId) return user && user.Role === APP_CONFIG.roles.OWNER ? APP_CONFIG.permissions : SECRETARY_PERMISSIONS
  return getSheetRecords('ROLE_PERMISSIONS').filter(function (item) { return String(item['Role ID']) === String(roleId) }).map(function (item) { return item.Permission })
}

function requirePermission(session, companyId, feature, permission) {
  requireFeature(session, companyId, feature)
  if (session.role === APP_CONFIG.roles.SUPER_ADMIN || session.role === APP_CONFIG.roles.OWNER) return
  if (userPermissions(session).indexOf(permission) === -1) throw apiError('FORBIDDEN', 'You do not have permission to perform this action.')
}

function publicFeature(row) { return { feature: row['Feature Key'], enabled: isTrue(row.Enabled) } }
function publicRole(role) {
  return { roleId: role['Role ID'], companyId: role['Company ID'], name: role['Role Name'], systemRole: isTrue(role['System Role']), active: isTrue(role.Active), permissions: getSheetRecords('ROLE_PERMISSIONS').filter(function (item) { return String(item['Role ID']) === String(role['Role ID']) }).map(function (item) { return item.Permission }) }
}

function getAccess(request) {
  var session = requireSession(request.token)
  initializeDatabase()
  var companyId = session.companyId
  return { companyId: companyId, features: session.role === APP_CONFIG.roles.SUPER_ADMIN ? APP_CONFIG.features.map(function (feature) { return { feature: feature, enabled: true } }) : getSheetRecords('COMPANY_FEATURES').filter(function (item) { return String(item['Company ID']) === String(companyId) }).map(publicFeature), permissions: userPermissions(session), role: session.role }
}

function getCompanyFeatures(request) {
  var session = requireSession(request.token)
  requireRole(session, [APP_CONFIG.roles.SUPER_ADMIN])
  initializeDatabase()
  var companyId = requireText(request.companyId, 'companyId')
  requireManagedCompany(companyId)
  return getSheetRecords('COMPANY_FEATURES').filter(function (item) { return String(item['Company ID']) === companyId }).map(publicFeature)
}

function setCompanyFeature(request) {
  var session = requireSession(request.token)
  requireRole(session, [APP_CONFIG.roles.SUPER_ADMIN])
  var companyId = requireText(request.companyId, 'companyId')
  requireManagedCompany(companyId)
  var feature = requireOption(request.feature, 'feature', APP_CONFIG.features)
  if (feature === 'DASHBOARD') throw apiError('VALIDATION_ERROR', 'Dashboard cannot be disabled.')
  var enabled = requireBoolean(request.enabled, 'enabled')
  initializeDatabase()
  var row = getSheetRecords('COMPANY_FEATURES').filter(function (item) { return String(item['Company ID']) === companyId && item['Feature Key'] === feature })[0]
  row.Enabled = enabled; row['Updated At'] = new Date().toISOString(); row['Updated By'] = session.userId
  updateAccessRecord('COMPANY_FEATURES', function (item) { return String(item['Company ID']) === companyId && item['Feature Key'] === feature }, row)
  return publicFeature(row)
}

function updateAccessRecord(sheetName, predicate, record) {
  var sheet = getSpreadsheet().getSheetByName(sheetName)
  var values = sheet.getDataRange().getValues()
  var headers = values[0]
  for (var index = 1; index < values.length; index += 1) {
    var item = headers.reduce(function (result, header, headerIndex) { result[header] = values[index][headerIndex]; return result }, {})
    if (predicate(item)) { sheet.getRange(index + 1, 1, 1, headers.length).setValues([headers.map(function (header) { return record[header] === undefined ? '' : record[header] })]); return record }
  }
  throw apiError('NOT_FOUND', 'The requested access record was not found.')
}

function getRoles(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, false)
  initializeDatabase()
  requirePermission(session, companyId, 'DASHBOARD', 'MANAGE_ROLES')
  return getSheetRecords('ROLES').filter(function (role) { return String(role['Company ID']) === String(companyId) && isTrue(role.Active) }).map(publicRole)
}

function createRole(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, true)
  initializeDatabase()
  requirePermission(session, companyId, 'DASHBOARD', 'MANAGE_ROLES')
  var role = request.role || {}
  var name = requireText(role.name, 'name')
  if (getSheetRecords('ROLES').some(function (item) { return String(item['Company ID']) === companyId && item['Role Name'].toLowerCase() === name.toLowerCase() })) throw apiError('DUPLICATE', 'A role with that name already exists.')
  var now = new Date().toISOString()
  var record = { 'Role ID': nextId('ROLES', 'Role ID', 'ROL'), 'Company ID': companyId, 'Role Name': name, 'System Role': false, 'Active': true, 'Created At': now, 'Updated At': now, 'Created By': session.userId }
  appendRecord('ROLES', APP_CONFIG.roleHeaders, record)
  ;(role.permissions || []).forEach(function (permission) { if (APP_CONFIG.permissions.indexOf(permission) !== -1) appendRecord('ROLE_PERMISSIONS', APP_CONFIG.rolePermissionHeaders, { 'Role ID': record['Role ID'], Permission: permission }) })
  return publicRole(record)
}

function updateRole(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, true)
  initializeDatabase()
  requirePermission(session, companyId, 'DASHBOARD', 'MANAGE_ROLES')
  var role = findRecordByValue('ROLES', 'Role ID', request.roleId)
  if (!role || String(role['Company ID']) !== companyId) throw apiError('NOT_FOUND', 'The requested role was not found.')
  if (isTrue(role['System Role'])) throw apiError('FORBIDDEN', 'System roles cannot be modified.')
  var input = request.role || {}
  role['Role Name'] = requireText(input.name || role['Role Name'], 'name')
  if (getSheetRecords('ROLES').some(function (item) { return String(item['Company ID']) === companyId && String(item['Role ID']) !== String(role['Role ID']) && item['Role Name'].toLowerCase() === role['Role Name'].toLowerCase() })) throw apiError('DUPLICATE', 'A role with that name already exists.')
  role['Updated At'] = new Date().toISOString()
  updateRecordByValue('ROLES', APP_CONFIG.roleHeaders, 'Role ID', role['Role ID'], role)
  var permissionSheet = getSpreadsheet().getSheetByName('ROLE_PERMISSIONS')
  var permissionValues = permissionSheet.getDataRange().getValues()
  var roleIndex = APP_CONFIG.rolePermissionHeaders.indexOf('Role ID')
  for (var permissionIndex = permissionValues.length - 1; permissionIndex >= 1; permissionIndex -= 1) if (String(permissionValues[permissionIndex][roleIndex]) === String(role['Role ID'])) permissionSheet.deleteRow(permissionIndex + 1)
  ;(input.permissions || []).forEach(function (permission) { if (APP_CONFIG.permissions.indexOf(permission) !== -1) appendRecord('ROLE_PERMISSIONS', APP_CONFIG.rolePermissionHeaders, { 'Role ID': role['Role ID'], Permission: permission }) })
  return publicRole(role)
}

function deleteRole(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, true)
  initializeDatabase()
  requirePermission(session, companyId, 'DASHBOARD', 'MANAGE_ROLES')
  var role = findRecordByValue('ROLES', 'Role ID', request.roleId)
  if (!role || String(role['Company ID']) !== companyId) throw apiError('NOT_FOUND', 'The requested role was not found.')
  if (isTrue(role['System Role'])) throw apiError('FORBIDDEN', 'System roles cannot be deleted.')
  if (getSheetRecords('USERS').some(function (user) { return String(user['Role ID']) === String(role['Role ID']) })) throw apiError('ROLE_IN_USE', 'Reassign users before deleting this role.')
  var sheet = getSpreadsheet().getSheetByName('ROLES')
  var values = sheet.getDataRange().getValues(); var idIndex = APP_CONFIG.roleHeaders.indexOf('Role ID')
  for (var index = 1; index < values.length; index += 1) if (String(values[index][idIndex]) === String(role['Role ID'])) { sheet.deleteRow(index + 1); break }
  return { roleId: role['Role ID'] }
}