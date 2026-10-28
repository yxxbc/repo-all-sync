import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { requestJson } from './http.mjs'
import { remoteExists } from './git.mjs'

async function createGitee(cfg, repo, dryRun) {
  if (!cfg.giteeToken) throw new Error('缺少 GITEE_TOKEN')
  if (dryRun) {
    console.log(`gitee: would create https://${cfg.giteeHost}/${cfg.giteeOwner || '<owner>'}/${repo}`)
    return
  }

  let me = null
  try {
    me = await requestJson(`https://${cfg.giteeHost}/api/v5/user`, {
      headers: { Authorization: `token ${cfg.giteeToken}` },
    })
  } catch {
    // fall back to the token user's namespace
  }
  const owner = cfg.giteeOwner || me?.login || ''
  const useOrg = Boolean(owner && me?.login && owner !== me.login)
  const url = useOrg
    ? `https://${cfg.giteeHost}/api/v5/orgs/${encodeURIComponent(owner)}/repos`
    : `https://${cfg.giteeHost}/api/v5/user/repos`

  try {
    await requestJson(url, {
      method: 'POST',
      headers: { Authorization: `token ${cfg.giteeToken}` },
      body: { name: repo, private: false, description: `${repo} mirror` },
    })
    console.log(`gitee: created ${repo}`)
  } catch (err) {
    const message = String(err.message)
    if (message.includes('(400)')) {
      console.log(`gitee: ${repo} already exists or name is unavailable`)
    } else {
      throw err
    }
  }
}

function createGitHub(cfg, repo, root, dryRun) {
  if (remoteExists(root, cfg.githubRemote)) {
    console.log(`github: remote "${cfg.githubRemote}" already exists`)
    return
  }
  if (dryRun) {
    console.log(`github: would run gh repo create ${repo} --public --source=. --remote=${cfg.githubRemote}`)
    return
  }
  const result = spawnSync(
    'gh',
    ['repo', 'create', repo, '--public', '--source=.', `--remote=${cfg.githubRemote}`],
    { cwd: root, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`gh repo create failed: ${(result.stderr || '').trim()}`)
  }
  console.log(`github: created ${repo}`)
}

function createCnb(cfg, repo, dryRun) {
  if (!cfg.cnbGroup) throw new Error('缺少 CNB_GROUP')
  if (dryRun) {
    console.log(`cnb: would create https://${cfg.cnbHost}/${cfg.cnbGroup}/${repo}`)
    return
  }
  if (!cfg.cnbToken) throw new Error('缺少 CNB_TOKEN')

  const probe = spawnSync('cnb', ['--version'], { encoding: 'utf8' })
  if (probe.error || probe.status !== 0) {
    console.log(`cnb: cnb CLI 未安装，请手动创建 https://${cfg.cnbHost}/${cfg.cnbGroup}/${repo}`)
    return
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-all-sync-cnb-'))
  try {
    fs.mkdirSync(path.join(tmp, '.cnb'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, '.cnb', 'token'),
      JSON.stringify({
        auths: { [cfg.cnbHost]: { access_token: cfg.cnbToken, platform_url: `https://${cfg.cnbHost}` } },
      }),
      { mode: 0o600 },
    )
    const result = spawnSync(
      'cnb',
      [
        'repositories',
        'create-repo',
        '--slug',
        cfg.cnbGroup,
        '--name',
        repo,
        '--visibility',
        'public',
        '--description',
        `${repo} mirror`,
      ],
      { env: { ...process.env, HOME: tmp }, encoding: 'utf8' },
    )
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    if (result.status === 0) {
      console.log(`cnb: created ${repo}`)
    } else if (output.includes('已存在') || output.includes('already exists')) {
      console.log(`cnb: ${repo} already exists`)
    } else {
      console.log(`cnb: create failed (${result.status}); ${output.slice(0, 300)}`)
      console.log(`cnb: you can create it manually at https://${cfg.cnbHost}/${cfg.cnbGroup}/${repo}`)
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

export async function createAll(cfg, repo, root, { dryRun = false } = {}) {
  createGitHub(cfg, repo, root, dryRun)
  await createGitee(cfg, repo, dryRun)
  createCnb(cfg, repo, dryRun)
}

export async function resolveGiteeOwner(cfg) {
  if (cfg.giteeOwner || !cfg.giteeToken) return cfg.giteeOwner
  try {
    const user = await requestJson(`https://${cfg.giteeHost}/api/v5/user`, {
      headers: { Authorization: `token ${cfg.giteeToken}` },
    })
    return user?.login || ''
  } catch {
    return ''
  }
}
