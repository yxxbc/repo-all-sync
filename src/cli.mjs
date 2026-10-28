import { spawnSync } from 'node:child_process'
import { loadConfig } from './config.mjs'
import { createAll, resolveGiteeOwner } from './create.mjs'
import { pushSource, repoName, repoRoot } from './git.mjs'
import { releaseAll } from './release.mjs'

const VALUE_FLAGS = new Set([
  'repo',
  'branch',
  'gitee-owner',
  'gitee-host',
  'cnb-group',
  'cnb-host',
  'github-remote',
  'version',
  'tag',
  'assets',
  'notes',
  'config',
])
const BOOL_FLAGS = new Set(['dry-run', 'github', 'json', 'help'])

export function parseArgs(argv) {
  const out = { command: 'help', flags: {}, files: [] }
  let i = 0
  if (argv[0] && !argv[0].startsWith('-')) {
    out.command = argv[0]
    i = 1
  }
  for (; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      out.files.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2)
    const inline = eq >= 0 ? arg.slice(eq + 1) : undefined
    const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

    if (BOOL_FLAGS.has(name)) {
      out.flags[key] = inline === undefined ? true : inline !== 'false'
      continue
    }
    if (!VALUE_FLAGS.has(name)) throw new Error(`unknown option --${name}`)
    const value = inline ?? argv[++i]
    if (value === undefined) throw new Error(`--${name} needs a value`)
    if (key === 'assets') (out.flags.assets ||= []).push(value)
    else out.flags[key] = value
  }
  return out
}

export function usage() {
  return `repo-all-sync — sync a git repository to GitHub / Gitee / CNB

Usage:
  repo-all-sync create [--dry-run] [options]
  repo-all-sync push   [--dry-run] [options]
  repo-all-sync release --version <ver> [--assets <dir>]... [--notes <file>] [--github] [--dry-run]
  repo-all-sync doctor
  repo-all-sync help

Options:
  --repo <name>            mirror repository name (default: directory name)
  --branch <name>          source branch (default: main)
  --gitee-owner <name>     Gitee owner (default: GITEE_OWNER)
  --cnb-group <name>       CNB group (default: CNB_GROUP)
  --github-remote <name>   GitHub remote (default: origin)
  --tag <tag>              release tag (default: v<version>)
  --dry-run                print actions without changing anything
  --github                 also create/upload the GitHub release

Environment:
  GITEE_HOST GITEE_OWNER GITEE_TOKEN
  CNB_HOST CNB_GROUP CNB_TOKEN CNB_API
  RAS_CONFIG  (default ~/.config/repo-all-sync/config.json)

Security: tokens are read from the environment or the config file. Never commit them.`
}

function tool(name) {
  const result = spawnSync(name, ['--version'], { encoding: 'utf8' })
  return !result.error && result.status === 0
}

function doctor(cfg) {
  const rows = [
    ['node', process.version, true],
    ['git', tool('git') ? 'found' : 'missing', tool('git')],
    ['gh', tool('gh') ? 'found' : 'missing (only needed for GitHub create/release)', tool('gh')],
    ['cnb', tool('cnb') ? 'found' : 'missing (only needed for CNB repo create)', tool('cnb')],
    ['config', cfg.configFile, true],
    ['GITEE_OWNER', cfg.giteeOwner || 'missing', Boolean(cfg.giteeOwner)],
    ['GITEE_TOKEN', cfg.giteeToken ? 'set' : 'missing', Boolean(cfg.giteeToken)],
    ['CNB_GROUP', cfg.cnbGroup || 'missing', Boolean(cfg.cnbGroup)],
    ['CNB_TOKEN', cfg.cnbToken ? 'set' : 'missing', Boolean(cfg.cnbToken)],
  ]
  for (const [name, value, ok] of rows) {
    console.log(`${ok ? 'ok  ' : 'warn'} ${name}: ${value}`)
  }
  if (!cfg.giteeToken || !cfg.cnbToken) {
    console.log('\nFill tokens via environment or ~/.config/repo-all-sync/config.json.')
  }
}

export async function main(argv) {
  const { command, flags } = parseArgs(argv)
  if (flags.help || command === 'help') {
    console.log(usage())
    return 0
  }
  if (flags.config) process.env.RAS_CONFIG = flags.config

  const cfg = loadConfig(flags)
  const root = repoRoot()
  const repo = repoName(root, cfg.repo)
  if (command !== 'doctor' && !cfg.giteeOwner && cfg.giteeToken) {
    cfg.giteeOwner = await resolveGiteeOwner(cfg)
  }

  switch (command) {
    case 'doctor':
      doctor(cfg)
      return 0
    case 'create':
      await createAll(cfg, repo, root, { dryRun: Boolean(flags.dryRun) })
      return 0
    case 'push':
      pushSource(cfg, root, repo, { dryRun: Boolean(flags.dryRun) })
      return 0
    case 'release':
      await releaseAll(cfg, repo, {
        version: flags.version,
        tag: flags.tag,
        assets: flags.assets || [],
        notesFile: flags.notes,
        github: Boolean(flags.github),
        dryRun: Boolean(flags.dryRun),
      })
      return 0
    default:
      console.error(`unknown command: ${command}\n`)
      console.log(usage())
      return 1
  }
}
