function jsonResponse(success, data, error) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: success, data: data === undefined ? null : data, error: error || null }))
    .setMimeType(ContentService.MimeType.JSON)
}

function successResponse(data) {
  return jsonResponse(true, data, null)
}

function errorResponse(code, message) {
  return jsonResponse(false, null, { code: code, message: message })
}

function apiError(code, message) {
  var error = new Error(message)
  error.apiCode = code
  return error
}
