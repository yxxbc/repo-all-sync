import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from '../src/cli.mjs'
import { expandAssets, tagOf } from '../src/release.mjs'

test('parseArgs handles command, booleans and values', () => {
  const { command, flags } = parseArgs(['push', '--dry-run', '--repo', 'app', '--branch=dev'])
  assert.equal(command, 'push')
  assert.equal(flags.dryRun, true)
  assert.equal(flags.repo, 'app')
  assert.equal(flags.branch, 'dev')
})

test('parseArgs collects repeated --assets', () => {
  const { flags } = parseArgs(['release', '--version', '1.0.0', '--assets', 'dist', '--assets', 'more'])
  assert.deepEqual(flags.assets, ['dist', 'more'])
  assert.equal(flags.version, '1.0.0')
})

test('parseArgs rejects unknown options', () => {
  assert.throws(() => parseArgs(['push', '--nope']), /unknown option/)
})

test('tagOf keeps or adds the v prefix', () => {
  assert.equal(tagOf('1.2.3'), 'v1.2.3')
  assert.equal(tagOf('v1.2.3'), 'v1.2.3')
})

test('expandAssets reads a directory and rejects missing paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ras-assets-'))
  fs.writeFileSync(path.join(dir, 'a.zip'), 'a')
  fs.writeFileSync(path.join(dir, 'b.tar.gz'), 'b')
  try {
    const files = expandAssets([dir]).map((f) => path.basename(f)).sort()
    assert.deepEqual(files, ['a.zip', 'b.tar.gz'])
    assert.throws(() => expandAssets([path.join(dir, 'missing.zip')]), /not found/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
