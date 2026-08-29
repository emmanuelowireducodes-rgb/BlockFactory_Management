function getProperties() {
  return PropertiesService.getScriptProperties()
}

function getSpreadsheet() {
  var spreadsheetId = getProperties().getProperty(APP_CONFIG.spreadsheetIdProperty)
  if (!spreadsheetId) throw apiError('DATABASE_NOT_CONFIGURED', 'MASTER_SPREADSHEET_ID has not been configured.')
  return SpreadsheetApp.openById(spreadsheetId)
}

function initializeDatabase() {
  var spreadsheet = getSpreadsheet()
  ensureSheet(spreadsheet, 'COMPANIES', APP_CONFIG.companyHeaders)
  ensureSheet(spreadsheet, 'USERS', APP_CONFIG.userHeaders)
  ensureSheet(spreadsheet, 'ROLES', APP_CONFIG.roleHeaders)
  ensureSheet(spreadsheet, 'ROLE_PERMISSIONS', APP_CONFIG.rolePermissionHeaders)
  ensureSheet(spreadsheet, 'COMPANY_FEATURES', APP_CONFIG.companyFeatureHeaders)
  Object.keys(APP_CONFIG.operationalSheetHeaders).forEach(function (sheetName) {
    ensureSheet(spreadsheet, sheetName, APP_CONFIG.operationalSheetHeaders[sheetName])
  })
  initializeAccessData()
  return { spreadsheetId: spreadsheet.getId(), sheets: ['COMPANIES', 'USERS'].concat(Object.keys(APP_CONFIG.operationalSheetHeaders)) }
}

function ensureSheet(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name)
  if (!sheet) sheet = spreadsheet.insertSheet(name)
  var existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
  while (existing.length && existing[existing.length - 1] === '') existing.pop()
  if (existing.join('') === '') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.setFrozenRows(1)
  } else if (existing.join('|') !== headers.join('|')) {
    if (existing.length < headers.length && existing.every(function (header, index) { return header === headers[index] })) {
      sheet.getRange(1, existing.length + 1, 1, headers.length - existing.length).setValues([headers.slice(existing.length)])
      return sheet
    }
    throw apiError('SCHEMA_MISMATCH', 'Sheet ' + name + ' has unexpected headers.')
  }
  return sheet
}

function getSheetRecords(sheetName) {
  var sheet = getSpreadsheet().getSheetByName(sheetName)
  if (!sheet) throw apiError('DATABASE_NOT_INITIALIZED', 'Missing required sheet: ' + sheetName)
  var values = sheet.getDataRange().getValues()
  if (values.length < 2) return []
  var headers = values[0]
  return values.slice(1).filter(function (row) { return row.some(function (value) { return value !== '' }) }).map(function (row) {
    return headers.reduce(function (record, header, index) {
      record[header] = row[index]
      return record
    }, {})
  })
}

function appendRecord(sheetName, headers, record) {
  var sheet = ensureSheet(getSpreadsheet(), sheetName, headers)
  sheet.appendRow(headers.map(function (header) { return record[header] === undefined ? '' : record[header] }))
}

function updateRecordByValue(sheetName, headers, columnName, value, record) {
  var sheet = ensureSheet(getSpreadsheet(), sheetName, headers)
  var columnIndex = headers.indexOf(columnName)
  if (columnIndex === -1) throw apiError('SCHEMA_MISMATCH', 'Sheet ' + sheetName + ' does not contain column ' + columnName + '.')
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) throw apiError('NOT_FOUND', 'No matching record was found.')
  var values = sheet.getRange(2, columnIndex + 1, lastRow - 1, 1).getValues()
  var expected = String(value)
  for (var index = 0; index < values.length; index += 1) {
    if (String(values[index][0]) === expected) {
      sheet.getRange(index + 2, 1, 1, headers.length).setValues([headers.map(function (header) {
        return record[header] === undefined ? '' : record[header]
      })])
      return record
    }
  }
  throw apiError('NOT_FOUND', 'No matching record was found.')
}

function nextId(sheetName, columnName, prefix) {
  var records = getSheetRecords(sheetName)
  var highest = records.reduce(function (max, record) {
    var match = String(record[columnName] || '').match(new RegExp('^' + prefix + '-(\\d+)$'))
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return prefix + '-' + String(highest + 1).padStart(3, '0')
}

function findRecordByValue(sheetName, columnName, value) {
  var expected = String(value)
  return getSheetRecords(sheetName).filter(function (record) {
    return String(record[columnName]) === expected
  })[0] || null
}
