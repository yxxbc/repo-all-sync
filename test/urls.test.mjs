import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  basicAuth,
  cnbAssetUrl,
  cnbRepoUrl,
  giteeApiBase,
  giteeAssetUrl,
  giteeReleaseUrl,
  giteeRepoUrl,
  repoNameFromPath,
} from '../src/urls.mjs'

test('repoNameFromPath handles trailing separators', () => {
  assert.equal(repoNameFromPath('/tmp/my-repo/'), 'my-repo')
  assert.equal(repoNameFromPath('C:\\work\\my-repo'), 'my-repo')
})

test('gitee URLs', () => {
  assert.equal(giteeRepoUrl('gitee.com', 'alice', 'app'), 'https://gitee.com/alice/app.git')
  assert.equal(giteeApiBase('gitee.com', 'alice', 'app'), 'https://gitee.com/api/v5/repos/alice/app')
  assert.equal(
    giteeReleaseUrl('gitee.com', 'alice', 'app', 'v1.2.3'),
    'https://gitee.com/alice/app/releases/tag/v1.2.3',
  )
  assert.equal(
    giteeAssetUrl('gitee.com', 'alice', 'app', 'v1.2.3', 'a b.zip'),
    'https://gitee.com/alice/app/releases/download/v1.2.3/a%20b.zip',
  )
})

test('cnb URLs use the /-/releases path', () => {
  assert.equal(cnbRepoUrl('cnb.cool', 'grp', 'app'), 'https://cnb.cool/grp/app.git')
  assert.equal(
    cnbAssetUrl('cnb.cool', 'grp', 'app', 'v1.2.3', 'a.zip'),
    'https://cnb.cool/grp/app/-/releases/download/v1.2.3/a.zip',
  )
})

test('basicAuth encodes user:token', () => {
  assert.equal(basicAuth('alice', 'secret'), `Basic ${Buffer.from('alice:secret').toString('base64')}`)
})
