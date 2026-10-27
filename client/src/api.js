import axios from 'axios'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '')
export const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 15000 })

let csrfToken = null
let csrfRequest = null
let refreshRequest = null

async function getCsrfToken() {
  if (csrfToken) return csrfToken
  csrfRequest ??= axios.get(`${API_BASE_URL}/auth/csrf`, { withCredentials: true, timeout: 15000 })
    .then(({ data }) => {
      csrfToken = data.data.csrfToken
      return csrfToken
    })
    .finally(() => { csrfRequest = null })
  return csrfRequest
}

const safeMethods = new Set(['get', 'head', 'options'])
api.interceptors.request.use(async (config) => {
  if (!safeMethods.has((config.method || 'get').toLowerCase())) {
    config.headers['X-CSRF-Token'] = await getCsrfToken()
  }
  return config
})

const authEntryPaths = ['/auth/login', '/auth/register', '/auth/verify-email', '/auth/forgot-password', '/auth/reset-password', '/auth/refresh']
api.interceptors.response.use((response) => response, async (error) => {
  const config = error.config
  if (!config || config._retried) return Promise.reject(error)

  if (error.response?.status === 403 && error.response?.data?.error?.code === 'CSRF_INVALID') {
    config._retried = true
    csrfToken = null
    config.headers['X-CSRF-Token'] = await getCsrfToken()
    return api(config)
  }

  const path = config.url || ''
  if (error.response?.status !== 401 || authEntryPaths.some((entry) => path.includes(entry))) return Promise.reject(error)

  config._retried = true
  try {
    refreshRequest ??= api.post('/auth/refresh').finally(() => { refreshRequest = null })
    await refreshRequest
    return api(config)
  } catch {
    return Promise.reject(error)
  }
})
