function getReportSummary(request) {
  var session = requireSession(request.token)
  var companyId = resolveOperationalCompanyId(session, request.companyId, false)
  var period = requireOption(request.period || 'ALL_TIME', 'period', ['TODAY', 'YESTERDAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM', 'ALL_TIME'])
  var customRange = period === 'CUSTOM' ? validateCustomReportRange(request.startDate, request.endDate) : null
  initializeDatabase()
  requirePermission(session, companyId, 'REPORTS', 'VIEW_REPORTS')

  var sales = getSheetRecords('SALES').filter(function (record) {
    return (!companyId || String(record['Company ID']) === companyId) && isReportDateInPeriod(record.Date, period, customRange)
  })
  var payments = getSheetRecords('CUSTOMER_PAYMENTS').filter(function (record) {
    return (!companyId || String(record['Company ID']) === companyId) && isReportDateInPeriod(record.Date, period, customRange)
  })
  var expenses = getSheetRecords('EXPENSES').filter(function (record) {
    return (!companyId || String(record['Company ID']) === companyId) && isReportDateInPeriod(record.Date, period, customRange)
  })
  var production = getSheetRecords('PRODUCTION').filter(function (record) {
    return (!companyId || String(record['Company ID']) === companyId) && record.Status === 'COMPLETED' && isReportDateInPeriod(record.Date, period, customRange)
  })
  var inventory = getSheetRecords('INVENTORY').filter(function (record) {
    return !companyId || String(record['Company ID']) === companyId
  })

  var totalSales = sumRecordValues(sales, 'Total Amount')
  var initialPayments = sumRecordValues(sales, 'Amount Paid')
  var outstandingBalance = sales.reduce(function (sum, sale) {
    return sum + Math.max(0, Number(sale['Total Amount']) - paymentTotalForSale(sale))
  }, 0)
  var totalExpenses = sumRecordValues(expenses, 'Amount')

  return {
    companyId: companyId || null,
    period: period,
    totalSales: totalSales,
    totalAmountPaid: initialPayments,
    outstandingCustomerBalance: outstandingBalance,
    totalExpenses: totalExpenses,
    completedProductionQuantity: sumRecordValues(production, 'Quantity'),
    currentInventory: inventory.reduce(function (sum, record) { return sum + Number(record.Quantity) }, 0),
    estimatedOperatingProfit: totalSales - totalExpenses,
    estimatedOperatingProfitLabel: 'Estimated Operating Profit (Total Sales - Total Expenses)'
  }
}

function sumRecordValues(records, columnName) {
  return records.reduce(function (sum, record) { return sum + Number(record[columnName]) }, 0)
}

function isReportDateInPeriod(value, period, customRange) {
  if (period === 'ALL_TIME') return true
  var date = normalizeReportDate(value)
  var timeZone = Session.getScriptTimeZone()
  var today = Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd')
  if (period === 'TODAY') return date === today
  if (period === 'YESTERDAY') return date === reportDateOffset(today, -1, timeZone)
  if (period === 'CUSTOM') return date >= customRange.startDate && date <= customRange.endDate
  if (period === 'THIS_MONTH') return date.slice(0, 7) === today.slice(0, 7)
  var todayDate = new Date(today + 'T00:00:00')
  var dayOfWeek = todayDate.getDay() || 7
  todayDate.setDate(todayDate.getDate() - dayOfWeek + 1)
  var weekStart = Utilities.formatDate(todayDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
  return date >= weekStart && date <= today
}

function validateCustomReportRange(startDate, endDate) {
  validateReportDateString(startDate, 'startDate')
  validateReportDateString(endDate, 'endDate')
  if (endDate < startDate) throw new Error('endDate must be on or after startDate.')
  return { startDate: startDate, endDate: endDate }
}

function validateReportDateString(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(fieldName + ' must be a valid YYYY-MM-DD date.')
  var parts = value.split('-')
  var calendarDate = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  if (calendarDate.getUTCFullYear() !== Number(parts[0]) || calendarDate.getUTCMonth() !== Number(parts[1]) - 1 || calendarDate.getUTCDate() !== Number(parts[2])) throw new Error(fieldName + ' must be a valid YYYY-MM-DD date.')
}

function reportDateOffset(dateString, days, timeZone) {
  var date = Utilities.parseDate(dateString + ' 12:00:00', timeZone, 'yyyy-MM-dd HH:mm:ss')
  date.setDate(date.getDate() + days)
  return Utilities.formatDate(date, timeZone, 'yyyy-MM-dd')
}

function normalizeReportDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd')
  }
  var text = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  var parsed = new Date(text)
  return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd')
}
