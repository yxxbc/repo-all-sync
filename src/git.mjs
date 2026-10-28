import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { basicAuth, cnbRepoUrl, giteeRepoUrl, repoNameFromPath } from './urls.mjs'

/** Run git and throw only stderr (never the argv, which may carry an auth header). */
export function git(cwd, args, { input } = {}) {
  const result = spawnSync('git', args, { cwd, input, encoding: input ? undefined : 'utf8' })
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : result.stderr || result.stdout || ''
    throw new Error(`git ${args[0]} failed${stderr.trim() ? `: ${stderr.trim()}` : ''}`)
  }
  return result.stdout
}

export function repoRoot() {
  return git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()
}

export function repoName(root, configured = '') {
  return configured || repoNameFromPath(root)
}

export function remoteExists(root, name) {
  try {
    git(root, ['remote', 'get-url', name])
    return true
  } catch {
    return false
  }
}

export function lastAuthor(root) {
  const out = git(root, ['log', '-1', '--format=%an%n%ae']).trim().split('\n')
  return { name: out[0] || 'repo-all-sync', email: out[1] || 'noreply@repo-all-sync.local' }
}

function pushWithHeader(root, url, refspec, auth) {
  git(root, ['-c', `http.extraHeader=Authorization: ${auth}`, 'push', url, refspec])
}

export function pushSource(cfg, root, repo, { dryRun = false } = {}) {
  const branch = cfg.branch
  const giteeUrl = giteeRepoUrl(cfg.giteeHost, cfg.giteeOwner, repo)
  const cnbUrl = cnbRepoUrl(cfg.cnbHost, cfg.cnbGroup, repo)

  if (dryRun) {
    console.log(`github: ${cfg.githubRemote} HEAD -> ${branch}`)
    console.log(`gitee:  ${giteeUrl} HEAD -> ${branch}`)
    console.log(`cnb:    ${cnbUrl} snapshot -> main (force)`)
    return
  }

  if (!remoteExists(root, cfg.githubRemote)) {
    throw new Error(`GitHub remote "${cfg.githubRemote}" 不存在；先运行 repo-all-sync create`)
  }
  if (!cfg.giteeOwner || !cfg.giteeToken) {
    throw new Error('缺少 GITEE_OWNER / GITEE_TOKEN')
  }
  if (!cfg.cnbGroup || !cfg.cnbToken) {
    throw new Error('缺少 CNB_GROUP / CNB_TOKEN')
  }

  git(root, ['push', cfg.githubRemote, `HEAD:refs/heads/${branch}`])

  pushWithHeader(
    root,
    giteeUrl,
    `HEAD:refs/heads/${branch}`,
    basicAuth(cfg.giteeOwner, cfg.giteeToken),
  )

  const author = lastAuthor(root)
  const sha = git(root, ['rev-parse', 'HEAD']).trim()
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-all-sync-'))
  try {
    const archive = spawnSync('git', ['archive', 'HEAD'], { cwd: root, maxBuffer: 1 << 30 })
    if (archive.status !== 0) {
      throw new Error(`git archive failed: ${String(archive.stderr || '').trim()}`)
    }
    const untar = spawnSync('tar', ['-x', '-C', snapshot], { input: archive.stdout })
    if (untar.status !== 0) {
      throw new Error(`tar failed (is tar available?): ${String(untar.stderr || '').trim()}`)
    }

    git(snapshot, ['init', '-b', 'main'])
    git(snapshot, ['config', 'user.name', author.name])
    git(snapshot, ['config', 'user.email', author.email])
    // Keep LFS pointer files as-is; do not require local LFS objects.
    git(snapshot, [
      '-c',
      'filter.lfs.clean=cat',
      '-c',
      'filter.lfs.smudge=cat',
      '-c',
      'filter.lfs.required=false',
      'add',
      '-A',
    ])
    git(snapshot, [
      '-c',
      'filter.lfs.clean=cat',
      '-c',
      'filter.lfs.smudge=cat',
      '-c',
      'filter.lfs.required=false',
      'commit',
      '-q',
      '-m',
      `chore(mirror): sync main @ ${sha}`,
    ])
    pushWithHeader(snapshot, cnbUrl, 'main:main', basicAuth('cnb', cfg.cnbToken))
  } finally {
    fs.rmSync(snapshot, { recursive: true, force: true })
  }
}
