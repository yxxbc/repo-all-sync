import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from '../src/config.mjs'

test('flags and env override the config file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ras-config-'))
  const file = path.join(dir, 'config.json')
  fs.writeFileSync(
    file,
    JSON.stringify({
      branch: 'dev',
      gitee: { host: 'gitee.example', owner: 'from-file' },
      cnb: { group: 'grp-from-file' },
    }),
  )
  process.env.RAS_CONFIG = file
  try {
    const cfg = loadConfig(
      { giteeOwner: 'from-flag', repo: 'app' },
      { GITEE_TOKEN: 'g-token', CNB_TOKEN: 'c-token' },
    )
    assert.equal(cfg.branch, 'dev')
    assert.equal(cfg.giteeHost, 'gitee.example')
    assert.equal(cfg.giteeOwner, 'from-flag')
    assert.equal(cfg.cnbGroup, 'grp-from-file')
    assert.equal(cfg.giteeToken, 'g-token')
    assert.equal(cfg.cnbToken, 'c-token')
    assert.equal(cfg.repo, 'app')
  } finally {
    delete process.env.RAS_CONFIG
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('missing config file is fine', () => {
  process.env.RAS_CONFIG = path.join(os.tmpdir(), 'ras-missing-config.json')
  try {
    const cfg = loadConfig({}, { CNB_GROUP: 'grp', GITEE_OWNER: 'alice' })
    assert.equal(cfg.cnbGroup, 'grp')
    assert.equal(cfg.giteeOwner, 'alice')
    assert.equal(cfg.githubRemote, 'origin')
    assert.equal(cfg.branch, 'main')
  } finally {
    delete process.env.RAS_CONFIG
  }
})
