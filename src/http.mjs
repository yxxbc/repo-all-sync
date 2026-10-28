/** Tiny fetch wrapper: JSON in/out, empty bodies allowed, no token logging. */
export async function request(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, { method, headers, body })
  const text = await response.text()
  if (!response.ok) {
    const snippet = text.trim().slice(0, 400)
    throw new Error(`${method} ${url} failed (${response.status})${snippet ? `: ${snippet}` : ''}`)
  }
  if (!text.trim()) return null
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('json')) return text
  return JSON.parse(text)
}

export async function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  return request(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function authHeader(scheme, token) {
  return { Authorization: `${scheme} ${token}` }
}
