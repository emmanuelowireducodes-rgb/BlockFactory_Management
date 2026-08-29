export function inventoryStatus(quantity, minimumStockLevel) {
  const stock = Number(quantity ?? 0)
  if (stock === 0) return 'OUT_OF_STOCK'
  if (minimumStockLevel === null || minimumStockLevel === undefined || minimumStockLevel === '') return 'MINIMUM_NOT_SET'
  return stock <= Number(minimumStockLevel) ? 'RUNNING_LOW' : 'IN_STOCK'
}

export function inventoryStatusLabel(status) {
  return status === 'OUT_OF_STOCK' ? 'OUT OF STOCK' : status === 'RUNNING_LOW' ? 'RUNNING LOW' : status === 'IN_STOCK' ? 'IN STOCK' : status === 'NOT_RECORDED' ? 'NOT RECORDED' : 'MINIMUM STOCK NOT SET'
}

export function inventoryStatusClass(status) {
  return status === 'OUT_OF_STOCK' ? 'out-of-stock' : status === 'RUNNING_LOW' ? 'running-low' : status === 'IN_STOCK' ? 'active' : 'inactive'
}
