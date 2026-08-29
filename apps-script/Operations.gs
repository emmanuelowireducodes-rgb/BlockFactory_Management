var OPERATIONAL_PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'BANK', 'CREDIT']
var EXPENSE_PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'BANK']
var EXPENSE_CATEGORIES = ['RAW_MATERIALS', 'LABOUR', 'FUEL', 'ELECTRICITY', 'WATER', 'TRANSPORT', 'REPAIRS_MAINTENANCE', 'EQUIPMENT', 'RENT', 'SALARIES', 'OTHER']

function requireOperationalWriter(session) {
  return session
}

function requireProductManager(session) {
  return session
}

function requireManagedCompany(companyId) {
  var normalized = requireText(companyId, 'companyId')
  if (!findRecordByValue('COMPANIES', 'Company ID', normalized)) throw apiError('COMPANY_NOT_FOUND', 'The requested company does not exist.')
  return normalized
}

function resolveOperationalCompanyId(session, requestedCompanyId, required) {
  var requested = optionalText(requestedCompanyId)
  if (session.role === APP_CONFIG.roles.SUPER_ADMIN) {
    if (!requested && required) throw apiError('VALIDATION_ERROR', 'companyId is required.')
    return requested ? requireManagedCompany(requested) : ''
  }
  var companyId = requireCompanyContext(session)
  if (requested && requested !== companyId) throw apiError('FORBIDDEN', 'Company ID is determined by the authenticated session.')
  return companyId
}

function requireOwnedRecord(session, sheetName, idColumn, id) {
  var record = findRecordByValue(sheetName, idColumn, requireText(id, idColumn))
  if (!record) throw apiError('NOT_FOUND', 'The requested record was not found.')
  if (session.role !== APP_CONFIG.roles.SUPER_ADMIN && String(record['Company ID']) !== requireCompanyContext(session)) {
    throw apiError('FORBIDDEN', 'You are not authorized to access this company record.')
  }
  return record
}

function requireNumber(value, fieldName, minimum) {
  if (value === '' || value === null || value === undefined) throw apiError('VALIDATION_ERROR', fieldName + ' is required.')
  var number = Number(value)
  if (!isFinite(number) || number < minimum) throw apiError('VALIDATION_ERROR', fieldName + ' must be at least ' + minimum + '.')
  return number
}

function optionalNumber(value, fieldName, minimum) {
  if (value === '' || value === null || value === undefined) return ''
  return requireNumber(value, fieldName, minimum)
}

function requireDate(value, fieldName) {
  var date = requireText(value, fieldName)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw apiError('VALIDATION_ERROR', fieldName + ' must use YYYY-MM-DD format.')
  return date
}

function requireOption(value, fieldName, options) {
  var option = requireText(value, fieldName).toUpperCase()
  if (options.indexOf(option) === -1) throw apiError('VALIDATION_ERROR', fieldName + ' is invalid.')
  return option
}

function isTrue(value) {
  return value === true || String(value).toUpperCase() === 'TRUE'
}

function publicProduct(record) {
  return {
    productId: record['Product ID'], companyId: record['Company ID'], productName: record['Product Name'], category: record.Category,
    unit: record.Unit, sellingPrice: Number(record['Selling Price']), costPrice: Number(record['Cost Price']), active: isTrue(record.Active),
    createdAt: record['Created At'], updatedAt: record['Updated At'], createdBy: record['Created By'],
    minimumStockLevel: optionalText(record['Minimum Stock Level']) === '' ? null : Number(record['Minimum Stock Level'])
  }
}

function publicProduction(record) {
  return {
    productionId: record['Production ID'], companyId: record['Company ID'], productId: record['Product ID'], date: record.Date,
    quantity: Number(record.Quantity), unit: record.Unit, producedBy: record['Produced By'], status: record.Status,
    notes: record.Notes, createdAt: record['Created At'], createdBy: record['Created By']
  }
}

function publicInventory(record) {
  return { inventoryId: record['Inventory ID'], companyId: record['Company ID'], productId: record['Product ID'], quantity: Number(record.Quantity), updatedAt: record['Updated At'] }
}

function publicInventoryTransaction(record) {
  return {
    transactionId: record['Transaction ID'], openingStockId: record['Transaction Type'] === 'OPENING_STOCK' ? record['Transaction ID'] : null,
    companyId: record['Company ID'], productId: record['Product ID'], transactionType: record['Transaction Type'],
    quantityChange: Number(record['Quantity Change']), date: record.Date, notes: record.Notes, recordedBy: record['Recorded By'],
    createdAt: record['Created At'], createdBy: record['Created By'], referenceType: record['Reference Type'], referenceId: record['Reference ID']
  }
}

function publicSale(record, paymentAmount) {
  var total = Number(record['Total Amount'])
  var initialPaid = Number(record['Amount Paid'])
  var amountPaid = paymentAmount === undefined ? initialPaid : paymentAmount
  var balanceDue = Math.max(0, total - amountPaid)
  return {
    saleId: record['Sale ID'], companyId: record['Company ID'], date: record.Date, customerName: record['Customer Name'], customerPhone: record['Customer Phone'],
    productId: record['Product ID'], quantity: Number(record.Quantity), unit: record.Unit, unitPrice: Number(record['Unit Price']), totalAmount: total,
    amountPaid: amountPaid, balanceDue: balanceDue, paymentMethod: record['Payment Method'], status: saleStatusFor(total, amountPaid),
    recordedBy: record['Recorded By'], notes: record.Notes, createdAt: record['Created At'], createdBy: record['Created By']
  }
}

function publicCustomerPayment(record) {
  return {
    paymentId: record['Payment ID'], companyId: record['Company ID'], saleId: record['Sale ID'], customerName: record['Customer Name'],
    date: record.Date, amount: Number(record.Amount), paymentMethod: record['Payment Method'], recordedBy: record['Recorded By'],
    notes: record.Notes, createdAt: record['Created At'], createdBy: record['Created By']
  }
}

function publicExpense(record) {
  return {
    expenseId: record['Expense ID'], companyId: record['Company ID'], date: record.Date, category: record.Category,
    description: record.Description, amount: Number(record.Amount), paymentMethod: record['Payment Method'], recordedBy: record['Recorded By'],
    notes: record.Notes, createdAt: record['Created At'], createdBy: record['Created By']
  }
}

function getProducts(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, false)
  var includeInactive = isTrue(request.includeInactive)
  initializeDatabase()
  requirePermission(session, companyId, 'PRODUCTS', 'VIEW_PRODUCTS')
  return getSheetRecords('PRODUCTS').filter(function (record) {
    return (!companyId || String(record['Company ID']) === companyId) && (includeInactive || isTrue(record.Active))
  }).map(publicProduct)
}

function createProduct(request) {
  var session = requireProductManager(requireSession(request.token))
  var product = request.product || {}
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    initializeDatabase()
    var companyId = resolveOperationalCompanyId(session, product.companyId || request.companyId, true)
    requirePermission(session, companyId, 'PRODUCTS', 'MANAGE_PRODUCTS')
    var name = requireText(product.productName, 'productName')
    if (getSheetRecords('PRODUCTS').some(function (record) { return String(record['Company ID']) === companyId && String(record['Product Name']).toLowerCase() === name.toLowerCase() })) {
      throw apiError('DUPLICATE', 'A product with that name already exists for this company.')
    }
    var now = new Date().toISOString()
    var record = {
      'Product ID': nextId('PRODUCTS', 'Product ID', 'PRD'), 'Company ID': companyId, 'Product Name': name,
      'Category': requireText(product.category, 'category'), 'Unit': requireText(product.unit, 'unit'),
      'Selling Price': requireNumber(product.sellingPrice, 'sellingPrice', 0), 'Cost Price': requireNumber(product.costPrice, 'costPrice', 0),
      'Active': true, 'Created At': now, 'Updated At': now, 'Created By': session.userId,
      'Minimum Stock Level': optionalNumber(product.minimumStockLevel, 'minimumStockLevel', 0)
    }
    appendRecord('PRODUCTS', APP_CONFIG.operationalSheetHeaders.PRODUCTS, record)
    return publicProduct(record)
  } finally {
    lock.releaseLock()
  }
}

function updateProduct(request) {
  var session = requireProductManager(requireSession(request.token))
  var product = request.product || {}
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    initializeDatabase()
    var record = requireOwnedRecord(session, 'PRODUCTS', 'Product ID', product.productId || request.productId)
    requirePermission(session, record['Company ID'], 'PRODUCTS', 'MANAGE_PRODUCTS')
    if (product.companyId && String(product.companyId) !== String(record['Company ID'])) throw apiError('FORBIDDEN', 'Product company cannot be changed.')
    if (product.productName !== undefined) record['Product Name'] = requireText(product.productName, 'productName')
    if (product.category !== undefined) record.Category = requireText(product.category, 'category')
    if (product.unit !== undefined) record.Unit = requireText(product.unit, 'unit')
    if (product.sellingPrice !== undefined) record['Selling Price'] = requireNumber(product.sellingPrice, 'sellingPrice', 0)
    if (product.costPrice !== undefined) record['Cost Price'] = requireNumber(product.costPrice, 'costPrice', 0)
    if (product.minimumStockLevel !== undefined) record['Minimum Stock Level'] = optionalNumber(product.minimumStockLevel, 'minimumStockLevel', 0)
    record['Updated At'] = new Date().toISOString()
    updateRecordByValue('PRODUCTS', APP_CONFIG.operationalSheetHeaders.PRODUCTS, 'Product ID', record['Product ID'], record)
    return publicProduct(record)
  } finally {
    lock.releaseLock()
  }
}

function deactivateProduct(request) {
  var session = requireProductManager(requireSession(request.token))
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    initializeDatabase()
    var record = requireOwnedRecord(session, 'PRODUCTS', 'Product ID', request.productId)
    requirePermission(session, record['Company ID'], 'PRODUCTS', 'MANAGE_PRODUCTS')
    record.Active = false
    record['Updated At'] = new Date().toISOString()
    updateRecordByValue('PRODUCTS', APP_CONFIG.operationalSheetHeaders.PRODUCTS, 'Product ID', record['Product ID'], record)
    return publicProduct(record)
  } finally {
    lock.releaseLock()
  }
}

function getInventoryRecord(companyId, productId) {
  return getSheetRecords('INVENTORY').filter(function (record) {
    return String(record['Company ID']) === String(companyId) && String(record['Product ID']) === String(productId)
  })[0] || null
}

function changeInventory(companyId, productId, delta, now, transaction) {
  var record = getInventoryRecord(companyId, productId)
  var quantity = (record ? Number(record.Quantity) : 0) + delta
  if (quantity < 0) throw apiError('INSUFFICIENT_STOCK', 'Insufficient inventory is available for this transaction.')
  if (!record) {
    record = { 'Inventory ID': nextId('INVENTORY', 'Inventory ID', 'INV'), 'Company ID': companyId, 'Product ID': productId, 'Quantity': quantity, 'Updated At': now }
    appendRecord('INVENTORY', APP_CONFIG.operationalSheetHeaders.INVENTORY, record)
  } else {
    record.Quantity = quantity
    record['Updated At'] = now
    updateRecordByValue('INVENTORY', APP_CONFIG.operationalSheetHeaders.INVENTORY, 'Inventory ID', record['Inventory ID'], record)
  }
  if (transaction) {
    appendRecord('INVENTORY_TRANSACTIONS', APP_CONFIG.operationalSheetHeaders.INVENTORY_TRANSACTIONS, {
      'Transaction ID': transaction.transactionId,
      'Company ID': companyId,
      'Product ID': productId,
      'Transaction Type': transaction.transactionType,
      'Quantity Change': delta,
      'Date': transaction.date,
      'Notes': optionalText(transaction.notes),
      'Recorded By': transaction.recordedBy,
      'Created At': now,
      'Created By': transaction.createdBy,
      'Reference Type': transaction.referenceType,
      'Reference ID': transaction.referenceId
    })
  }
  return record
}

function requireActiveProduct(session, productId) {
  var product = requireOwnedRecord(session, 'PRODUCTS', 'Product ID', productId)
  if (!isTrue(product.Active)) throw apiError('VALIDATION_ERROR', 'Deactivated products cannot be used for new transactions.')
  return product
}

function getInventory(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, false)
  initializeDatabase()
  requirePermission(session, companyId, 'INVENTORY', 'VIEW_INVENTORY')
  return getSheetRecords('INVENTORY').filter(function (record) { return !companyId || String(record['Company ID']) === companyId }).map(publicInventory)
}

function getInventoryTransactions(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, false)
  initializeDatabase()
  requirePermission(session, companyId, 'INVENTORY', 'VIEW_INVENTORY')
  return getSheetRecords('INVENTORY_TRANSACTIONS').filter(function (record) {
    return !companyId || String(record['Company ID']) === companyId
  }).map(publicInventoryTransaction)
}

function createOpeningStock(request) {
  var session = requireProductManager(requireSession(request.token))
  var openingStock = request.openingStock || {}
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    initializeDatabase()
    var companyId = resolveOperationalCompanyId(session, openingStock.companyId || request.companyId, true)
    requirePermission(session, companyId, 'INVENTORY', 'MANAGE_INVENTORY')
    var product = requireOwnedRecord(session, 'PRODUCTS', 'Product ID', openingStock.productId)
    if (String(product['Company ID']) !== companyId) throw apiError('FORBIDDEN', 'Product belongs to another company.')
    var existing = getSheetRecords('INVENTORY_TRANSACTIONS').some(function (record) {
      return record['Transaction Type'] === 'OPENING_STOCK' && String(record['Company ID']) === companyId && String(record['Product ID']) === String(product['Product ID'])
    })
    if (existing) throw apiError('DUPLICATE', 'Opening stock has already been recorded for this company and product.')
    var quantity = requireNumber(openingStock.quantity, 'quantity', Number.MIN_VALUE)
    var now = new Date().toISOString()
    var transactionId = nextId('INVENTORY_TRANSACTIONS', 'Transaction ID', 'OST')
    changeInventory(companyId, product['Product ID'], quantity, now, {
      transactionId: transactionId,
      transactionType: 'OPENING_STOCK',
      date: requireDate(openingStock.date, 'date'),
      notes: requireText(openingStock.notes, 'notes'),
      recordedBy: session.userId,
      createdBy: session.userId,
      referenceType: 'OPENING_STOCK',
      referenceId: transactionId
    })
    return publicInventoryTransaction(findRecordByValue('INVENTORY_TRANSACTIONS', 'Transaction ID', transactionId))
  } finally {
    lock.releaseLock()
  }
}

function getProduction(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, false)
  initializeDatabase()
  requirePermission(session, companyId, 'PRODUCTION', 'VIEW_PRODUCTION')
  return getSheetRecords('PRODUCTION').filter(function (record) { return !companyId || String(record['Company ID']) === companyId }).map(publicProduction)
}

function createProduction(request) {
  var session = requireOperationalWriter(requireSession(request.token))
  var production = request.production || {}
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    initializeDatabase()
    var companyId = resolveOperationalCompanyId(session, production.companyId || request.companyId, true)
    requirePermission(session, companyId, 'PRODUCTION', 'CREATE_PRODUCTION')
    var product = requireActiveProduct(session, production.productId)
    if (String(product['Company ID']) !== companyId) throw apiError('FORBIDDEN', 'Product belongs to another company.')
    var unit = requireText(production.unit || product.Unit, 'unit')
    if (unit !== String(product.Unit)) throw apiError('VALIDATION_ERROR', 'unit must match the product unit.')
    var now = new Date().toISOString()
    var record = {
      'Production ID': nextId('PRODUCTION', 'Production ID', 'PROD'), 'Company ID': companyId, 'Product ID': product['Product ID'],
      'Date': requireDate(production.date, 'date'), 'Quantity': requireNumber(production.quantity, 'quantity', Number.MIN_VALUE), 'Unit': unit,
      'Produced By': session.userId, 'Status': 'COMPLETED', 'Notes': optionalText(production.notes), 'Created At': now, 'Created By': session.userId
    }
    appendRecord('PRODUCTION', APP_CONFIG.operationalSheetHeaders.PRODUCTION, record)
    changeInventory(companyId, product['Product ID'], Number(record.Quantity), now, {
      transactionId: nextId('INVENTORY_TRANSACTIONS', 'Transaction ID', 'INV'), transactionType: 'COMPLETED_PRODUCTION',
      date: record.Date, notes: record.Notes, recordedBy: session.userId, createdBy: session.userId,
      referenceType: 'PRODUCTION', referenceId: record['Production ID']
    })
    return publicProduction(record)
  } finally {
    lock.releaseLock()
  }
}

function cancelProduction(request) {
  var session = requireOperationalWriter(requireSession(request.token))
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    initializeDatabase()
    var record = requireOwnedRecord(session, 'PRODUCTION', 'Production ID', request.productionId)
    requirePermission(session, record['Company ID'], 'PRODUCTION', 'CREATE_PRODUCTION')
    if (record.Status !== 'COMPLETED') throw apiError('VALIDATION_ERROR', 'Only completed production can be cancelled.')
    var now = new Date().toISOString()
    changeInventory(record['Company ID'], record['Product ID'], -Number(record.Quantity), now, {
      transactionId: nextId('INVENTORY_TRANSACTIONS', 'Transaction ID', 'INV'), transactionType: 'CANCELLED_PRODUCTION',
      date: record.Date, notes: record.Notes, recordedBy: session.userId, createdBy: session.userId,
      referenceType: 'PRODUCTION', referenceId: record['Production ID']
    })
    record.Status = 'CANCELLED'
    updateRecordByValue('PRODUCTION', APP_CONFIG.operationalSheetHeaders.PRODUCTION, 'Production ID', record['Production ID'], record)
    return publicProduction(record)
  } finally {
    lock.releaseLock()
  }
}

function saleStatusFor(total, amountPaid) {
  if (amountPaid >= total) return 'PAID'
  return amountPaid > 0 ? 'PARTIAL' : 'UNPAID'
}

function paymentTotalForSale(sale) {
  return Number(sale['Amount Paid'])
}

function getSales(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, false)
  initializeDatabase()
  requirePermission(session, companyId, 'SALES', 'VIEW_SALES')
  return getSheetRecords('SALES').filter(function (record) { return !companyId || String(record['Company ID']) === companyId }).map(function (record) {
    return publicSale(record, paymentTotalForSale(record))
  })
}

function getSale(request) {
  var session = requireSession(request.token)
  initializeDatabase()
  var sale = requireOwnedRecord(session, 'SALES', 'Sale ID', request.saleId)
  requirePermission(session, sale['Company ID'], 'SALES', 'VIEW_SALES')
  return publicSale(sale, paymentTotalForSale(sale))
}

function createSale(request) {
  var session = requireOperationalWriter(requireSession(request.token))
  var sale = request.sale || {}
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    initializeDatabase()
    var companyId = resolveOperationalCompanyId(session, sale.companyId || request.companyId, true)
    requirePermission(session, companyId, 'SALES', 'CREATE_SALE')
    var product = requireActiveProduct(session, sale.productId)
    if (String(product['Company ID']) !== companyId) throw apiError('FORBIDDEN', 'Product belongs to another company.')
    var quantity = requireNumber(sale.quantity, 'quantity', Number.MIN_VALUE)
    var inventory = getInventoryRecord(companyId, product['Product ID'])
    if (!inventory || Number(inventory.Quantity) < quantity) throw apiError('INSUFFICIENT_STOCK', 'Insufficient inventory is available for this sale.')
    var total = quantity * Number(product['Selling Price'])
    var amountPaid = requireNumber(sale.amountPaid === undefined ? 0 : sale.amountPaid, 'amountPaid', 0)
    if (amountPaid > total) throw apiError('VALIDATION_ERROR', 'amountPaid cannot exceed totalAmount.')
    var now = new Date().toISOString()
    var record = {
      'Sale ID': nextId('SALES', 'Sale ID', 'SALE'), 'Company ID': companyId, 'Date': requireDate(sale.date, 'date'),
      'Customer Name': requireText(sale.customerName, 'customerName'), 'Customer Phone': optionalText(sale.customerPhone), 'Product ID': product['Product ID'],
      'Quantity': quantity, 'Unit': product.Unit, 'Unit Price': Number(product['Selling Price']), 'Total Amount': total, 'Amount Paid': amountPaid,
      'Balance Due': total - amountPaid, 'Payment Method': requireOption(sale.paymentMethod, 'paymentMethod', OPERATIONAL_PAYMENT_METHODS),
      'Status': saleStatusFor(total, amountPaid), 'Recorded By': session.userId, 'Notes': optionalText(sale.notes), 'Created At': now, 'Created By': session.userId
    }
    appendRecord('SALES', APP_CONFIG.operationalSheetHeaders.SALES, record)
    changeInventory(companyId, product['Product ID'], -quantity, now, {
      transactionId: nextId('INVENTORY_TRANSACTIONS', 'Transaction ID', 'INV'), transactionType: 'COMPLETED_SALE',
      date: record.Date, notes: record.Notes, recordedBy: session.userId, createdBy: session.userId,
      referenceType: 'SALE', referenceId: record['Sale ID']
    })
    return publicSale(record, amountPaid)
  } finally {
    lock.releaseLock()
  }
}

function getCustomerPayments(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, false)
  initializeDatabase()
  requirePermission(session, companyId, 'CUSTOMER_PAYMENTS', 'VIEW_CUSTOMER_PAYMENTS')
  return getSheetRecords('CUSTOMER_PAYMENTS').filter(function (record) { return !companyId || String(record['Company ID']) === companyId }).map(publicCustomerPayment)
}

function createCustomerPayment(request) {
  var session = requireOperationalWriter(requireSession(request.token))
  var payment = request.payment || {}
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    initializeDatabase()
    var sale = requireOwnedRecord(session, 'SALES', 'Sale ID', payment.saleId)
    var companyId = resolveOperationalCompanyId(session, payment.companyId || request.companyId, false) || sale['Company ID']
    requirePermission(session, companyId, 'CUSTOMER_PAYMENTS', 'CREATE_CUSTOMER_PAYMENT')
    if (String(companyId) !== String(sale['Company ID'])) throw apiError('FORBIDDEN', 'Sale belongs to another company.')
    var amount = requireNumber(payment.amount, 'amount', Number.MIN_VALUE)
    var alreadyPaid = paymentTotalForSale(sale)
    var outstanding = Number(sale['Total Amount']) - alreadyPaid
    if (amount > outstanding) throw apiError('VALIDATION_ERROR', 'Payment cannot exceed the outstanding balance.')
    var now = new Date().toISOString()
    var record = {
      'Payment ID': nextId('CUSTOMER_PAYMENTS', 'Payment ID', 'PAY'), 'Company ID': sale['Company ID'], 'Sale ID': sale['Sale ID'],
      'Customer Name': sale['Customer Name'], 'Date': requireDate(payment.date, 'date'), 'Amount': amount,
      'Payment Method': requireOption(payment.paymentMethod, 'paymentMethod', OPERATIONAL_PAYMENT_METHODS), 'Recorded By': session.userId,
      'Notes': optionalText(payment.notes), 'Created At': now, 'Created By': session.userId
    }
    appendRecord('CUSTOMER_PAYMENTS', APP_CONFIG.operationalSheetHeaders.CUSTOMER_PAYMENTS, record)
    var newPaid = alreadyPaid + amount
    sale['Amount Paid'] = newPaid
    sale['Balance Due'] = Number(sale['Total Amount']) - newPaid
    sale.Status = saleStatusFor(Number(sale['Total Amount']), newPaid)
    var paymentDate = record.Date.split('-').reverse().join('/')
    var paymentNote = 'Payment ' + paymentDate + ': ' + amount + ' via ' + record['Payment Method'].replace(/_/g, ' ')
    if (record.Notes) paymentNote += ' - ' + record.Notes
    var existingNotes = optionalText(sale.Notes)
    if (existingNotes.indexOf(paymentNote) === -1) sale.Notes = existingNotes ? existingNotes + '\n' + paymentNote : paymentNote
    updateRecordByValue('SALES', APP_CONFIG.operationalSheetHeaders.SALES, 'Sale ID', sale['Sale ID'], sale)
    return { payment: publicCustomerPayment(record), sale: publicSale(sale, newPaid) }
  } finally {
    lock.releaseLock()
  }
}

function getExpenses(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, false)
  initializeDatabase()
  requirePermission(session, companyId, 'EXPENSES', 'VIEW_EXPENSES')
  return getSheetRecords('EXPENSES').filter(function (record) { return !companyId || String(record['Company ID']) === companyId }).map(publicExpense)
}

function createExpense(request) {
  var session = requireOperationalWriter(requireSession(request.token))
  var expense = request.expense || {}
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    initializeDatabase()
    var companyId = resolveOperationalCompanyId(session, expense.companyId || request.companyId, true)
    requirePermission(session, companyId, 'EXPENSES', 'CREATE_EXPENSE')
    var now = new Date().toISOString()
    var record = {
      'Expense ID': nextId('EXPENSES', 'Expense ID', 'EXP'), 'Company ID': companyId, 'Date': requireDate(expense.date, 'date'),
      'Category': requireOption(expense.category, 'category', EXPENSE_CATEGORIES), 'Description': requireText(expense.description, 'description'),
      'Amount': requireNumber(expense.amount, 'amount', Number.MIN_VALUE), 'Payment Method': requireOption(expense.paymentMethod, 'paymentMethod', EXPENSE_PAYMENT_METHODS),
      'Recorded By': session.userId, 'Notes': optionalText(expense.notes), 'Created At': now, 'Created By': session.userId
    }
    appendRecord('EXPENSES', APP_CONFIG.operationalSheetHeaders.EXPENSES, record)
    return publicExpense(record)
  } finally {
    lock.releaseLock()
  }
}
