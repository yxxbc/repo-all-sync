export function repoNameFromPath(root) {
  const clean = root.replace(/[\\/]+$/, '')
  const parts = clean.split(/[\\/]/)
  return parts[parts.length - 1] || 'repo'
}

export function giteeRepoUrl(host, owner, repo) {
  return `https://${host}/${owner}/${repo}.git`
}

export function giteeApiBase(host, owner, repo) {
  return `https://${host}/api/v5/repos/${owner}/${repo}`
}

export function giteeReleaseUrl(host, owner, repo, tag) {
  return `https://${host}/${owner}/${repo}/releases/tag/${encodeURIComponent(tag)}`
}

export function giteeAssetUrl(host, owner, repo, tag, name) {
  return `https://${host}/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`
}

export function cnbRepoUrl(host, group, repo) {
  return `https://${host}/${group}/${repo}.git`
}

export function cnbReleaseUrl(host, group, repo, tag) {
  return `https://${host}/${group}/${repo}/-/releases/tag/${encodeURIComponent(tag)}`
}

export function cnbAssetUrl(host, group, repo, tag, name) {
  return `https://${host}/${group}/${repo}/-/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`
}

export function basicAuth(user, token) {
  return `Basic ${Buffer.from(`${user}:${token}`, 'utf8').toString('base64')}`
}
