const memoryCache = new Map()
const inFlightRequests = new Map()
const cacheGenerations = new Map()
const CACHE_VERSION = 1

function storageKey(dataset, scope) {
  return `blockfactory.data.v${CACHE_VERSION}.${scope}.${dataset}`
}

export function cacheScope(user, companyId = '') {
  const identity = user?.userId || user?.username || user?.role || 'anonymous'
  const company = companyId || user?.companyId || 'all'
  return `${identity}.${company}`
}

export function readCached(dataset, scope) {
  const key = storageKey(dataset, scope)
  const memory = memoryCache.get(key)
  if (memory) return memory.data
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null')
    if (!stored || stored.data === undefined) return null
    memoryCache.set(key, stored)
    return stored.data
  } catch {
    return null
  }
}

export function writeCached(dataset, scope, data) {
  const key = storageKey(dataset, scope)
  const entry = { data, updatedAt: Date.now() }
  memoryCache.set(key, entry)
  try {
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
  }
  return data
}

export function invalidateCached(dataset, scope) {
  const key = storageKey(dataset, scope)
  cacheGenerations.set(key, (cacheGenerations.get(key) || 0) + 1)
  inFlightRequests.delete(key)
}

export function fetchCached(dataset, scope, fetcher) {
  const key = storageKey(dataset, scope)
  if (inFlightRequests.has(key)) return inFlightRequests.get(key)
  const generation = cacheGenerations.get(key) || 0
  const request = Promise.resolve().then(fetcher).then((data) => {
    if (generation === (cacheGenerations.get(key) || 0)) writeCached(dataset, scope, data)
    return data
  }).finally(() => inFlightRequests.delete(key))
  inFlightRequests.set(key, request)
  return request
}

export function subscribeToVisibility(refresh) {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') refresh()
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}
