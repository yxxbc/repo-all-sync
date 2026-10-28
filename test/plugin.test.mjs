import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))

test('plugin and npm package versions stay in sync', () => {
  assert.equal(read('.claude-plugin/plugin.json').version, read('package.json').version)
})

test('marketplace entry and plugin manifest names match', () => {
  const marketplace = read('.claude-plugin/marketplace.json')
  const manifest = read('.claude-plugin/plugin.json')
  assert.equal(marketplace.plugins.length, 1)
  assert.equal(marketplace.plugins[0].name, manifest.name)
})

test('npm package ships the plugin files', () => {
  const pkg = read('package.json')
  for (const entry of ['.claude-plugin', 'bin', 'src', 'skills']) {
    assert.ok(pkg.files.includes(entry), `package.json files is missing ${entry}`)
  }
  assert.ok(fs.existsSync(path.join(root, 'skills/repo-all-sync/SKILL.md')))
  assert.ok(fs.existsSync(path.join(root, 'bin/repo-all-sync')))
})
