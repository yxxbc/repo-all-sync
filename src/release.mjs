import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { request, requestJson } from './http.mjs'
import { resolveGiteeOwner } from './create.mjs'
import { cnbAssetUrl, cnbReleaseUrl, giteeAssetUrl, giteeReleaseUrl } from './urls.mjs'

export function tagOf(version) {
  return String(version).startsWith('v') ? String(version) : `v${version}`
}

export function expandAssets(inputs) {
  const files = []
  for (const input of inputs) {
    const full = path.resolve(input)
    if (!fs.existsSync(full)) throw new Error(`asset not found: ${input}`)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
        if (entry.isFile()) files.push(path.join(full, entry.name))
      }
    } else {
      files.push(full)
    }
  }
  if (files.length === 0) throw new Error('no release assets found')
  return files
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function notesBody(file) {
  return file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : ''
}

// ===== Gitee =====
async function giteeJson(cfg, repo, endpoint, init = {}) {
  return requestJson(`https://${cfg.giteeHost}/api/v5/repos/${cfg.giteeOwner}/${repo}${endpoint}`, {
    ...init,
    headers: { Authorization: `token ${cfg.giteeToken}`, ...(init.headers || {}) },
  })
}

async function giteeGetRelease(cfg, repo, tag) {
  try {
    return await giteeJson(cfg, repo, `/releases/tags/${encodeURIComponent(tag)}`)
  } catch (err) {
    if (String(err.message).includes('(404)')) return null
    throw err
  }
}

async function giteeEnsureRelease(cfg, repo, tag, body) {
  const existing = await giteeGetRelease(cfg, repo, tag)
  if (existing) return existing
  const created = await giteeJson(cfg, repo, '/releases', {
    method: 'POST',
    body: { tag_name: tag, target_commitish: 'main', name: tag, body: body || tag, prerelease: false },
  })
  if (created?.id) return created
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const release = await giteeGetRelease(cfg, repo, tag)
    if (release) return release
  }
  throw new Error(`Gitee release ${tag} could not be created`)
}

async function giteeUpload(cfg, repo, releaseId, file) {
  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file))
  await request(
    `https://${cfg.giteeHost}/api/v5/repos/${cfg.giteeOwner}/${repo}/releases/${releaseId}/attach_files`,
    { method: 'POST', headers: { Authorization: `token ${cfg.giteeToken}` }, body: form },
  )
}

// ===== CNB =====
function cnbHeaders(cfg) {
  return {
    Authorization: `Bearer ${cfg.cnbToken}`,
    Accept: 'application/vnd.cnb.api+json',
    'Content-Type': 'application/json',
  }
}

async function cnbJson(cfg, repo, endpoint, init = {}) {
  return requestJson(`https://${cfg.cnbApi}/${cfg.cnbGroup}/${repo}${endpoint}`, {
    ...init,
    headers: { ...cnbHeaders(cfg), ...(init.headers || {}) },
  })
}

async function cnbGetRelease(cfg, repo, tag) {
  try {
    return await cnbJson(cfg, repo, `/-/releases/tags/${encodeURIComponent(tag)}`)
  } catch (err) {
    if (String(err.message).includes('(404)')) return null
    throw err
  }
}

async function cnbEnsureRelease(cfg, repo, tag, body) {
  const existing = await cnbGetRelease(cfg, repo, tag)
  if (existing) return existing
  return await cnbJson(cfg, repo, '/-/releases', {
    method: 'POST',
    body: {
      tag_name: tag,
      target_commitish: 'main',
      name: tag,
      body: body || tag,
      draft: true,
      prerelease: false,
      make_latest: 'true',
    },
  })
}

async function cnbUpload(cfg, repo, releaseId, file) {
  const name = path.basename(file)
  const size = fs.statSync(file).size
  const upload = await cnbJson(cfg, repo, `/-/releases/${releaseId}/asset-upload-url`, {
    method: 'POST',
    body: { asset_name: name, size, overwrite: true, ttl: 0 },
  })
  if (!upload?.upload_url || !upload?.verify_url) {
    throw new Error(`CNB did not return an upload URL for ${name}`)
  }
  const put = await fetch(upload.upload_url, {
    method: 'PUT',
    body: fs.readFileSync(file),
    headers: { 'Content-Length': String(size), 'Content-Type': 'application/octet-stream' },
  })
  if (!put.ok) throw new Error(`upload ${name} failed (${put.status})`)
  const verifyUrl = new URL(upload.verify_url, `${cfg.cnbApi}/`).toString()
  await request(`${verifyUrl}${verifyUrl.includes('?') ? '&' : '?'}ttl=0`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.cnbToken}` },
  })
}

// ===== GitHub (delegated to gh) =====
function githubRelease(cfg, tag, files, notesFile, dryRun) {
  if (dryRun) {
    console.log(`github: gh release create ${tag} --notes-file ${notesFile || '<notes>'} <files>`)
    return
  }
  const view = spawnSync('gh', ['release', 'view', tag, '--json', 'tagName'], { encoding: 'utf8' })
  if (view.status !== 0) {
    const args = ['release', 'create', tag, '--title', tag]
    if (notesFile) args.push('--notes-file', notesFile)
    else args.push('--notes', tag)
    args.push(...files)
    const created = spawnSync('gh', args, { encoding: 'utf8' })
    if (created.status !== 0) throw new Error(`gh release create failed: ${(created.stderr || '').trim()}`)
  } else {
    const uploaded = spawnSync('gh', ['release', 'upload', tag, ...files, '--clobber'], {
      encoding: 'utf8',
    })
    if (uploaded.status !== 0) {
      throw new Error(`gh release upload failed: ${(uploaded.stderr || '').trim()}`)
    }
  }
  console.log(`github: ${tag}`)
}

export async function releaseAll(cfg, repo, { version, tag, assets, notesFile, github = false, dryRun = false }) {
  if (!version && !tag) throw new Error('需要 --version 或 --tag')
  const releaseTag = tag ? tagOf(tag) : tagOf(version)
  const files = expandAssets(assets)
  const body = notesBody(notesFile)

  if (dryRun) {
    console.log(`release ${releaseTag}: ${files.length} assets`)
    console.log(`gitee: ${giteeReleaseUrl(cfg.giteeHost, cfg.giteeOwner || '<owner>', repo, releaseTag)}`)
    console.log(`cnb:   ${cnbReleaseUrl(cfg.cnbHost, cfg.cnbGroup || '<group>', repo, releaseTag)}`)
    for (const file of files) {
      console.log(
        `  - ${path.basename(file)} (${sha256(file).slice(0, 12)}…) -> gitee / cnb${github ? ' / github' : ''}`,
      )
    }
    return
  }

  cfg.giteeOwner = await resolveGiteeOwner(cfg)
  if (!cfg.giteeOwner || !cfg.giteeToken) throw new Error('缺少 GITEE_OWNER / GITEE_TOKEN')
  if (!cfg.cnbGroup || !cfg.cnbToken) throw new Error('缺少 CNB_GROUP / CNB_TOKEN')

  const giteeRelease = await giteeEnsureRelease(cfg, repo, releaseTag, body)
  const existing = new Map(
    ((await giteeJson(cfg, repo, `/releases/${giteeRelease.id}/attach_files?per_page=100`)) || []).map(
      (a) => [a.name, a],
    ),
  )
  for (const file of files) {
    const name = path.basename(file)
    const size = fs.statSync(file).size
    const current = existing.get(name)
    if (current && Number(current.size) === size) {
      console.log(`gitee: skip ${name}`)
      continue
    }
    if (current) {
      await giteeJson(cfg, repo, `/releases/${giteeRelease.id}/attach_files/${current.id}`, {
        method: 'DELETE',
      })
    }
    await giteeUpload(cfg, repo, giteeRelease.id, file)
    console.log(`gitee: upload ${name}`)
  }

  const cnbRelease = await cnbEnsureRelease(cfg, repo, releaseTag, body)
  for (const file of files) {
    await cnbUpload(cfg, repo, cnbRelease.id, file)
    console.log(`cnb: upload ${path.basename(file)}`)
  }
  await cnbJson(cfg, repo, `/-/releases/${cnbRelease.id}`, {
    method: 'PATCH',
    body: { name: releaseTag, body: body || releaseTag, draft: false, prerelease: false, make_latest: 'true' },
  })

  if (github) githubRelease(cfg, releaseTag, files, notesFile, dryRun)

  for (const file of files) {
    const name = path.basename(file)
    console.log(`  gitee: ${giteeAssetUrl(cfg.giteeHost, cfg.giteeOwner, repo, releaseTag, name)}`)
    console.log(`  cnb:   ${cnbAssetUrl(cfg.cnbHost, cfg.cnbGroup, repo, releaseTag, name)}`)
  }
}
