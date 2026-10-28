import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_GITEE_HOST = 'gitee.com'
export const DEFAULT_CNB_HOST = 'cnb.cool'
export const DEFAULT_CNB_API = 'https://api.cnb.cool'

export function defaultConfigPath() {
  return process.env.RAS_CONFIG || path.join(os.homedir(), '.config', 'repo-all-sync', 'config.json')
}

/** Merge CLI flags, environment and an optional JSON config file. */
export function loadConfig(flags = {}, env = process.env) {
  let file = {}
  try {
    file = JSON.parse(fs.readFileSync(defaultConfigPath(), 'utf8'))
  } catch {
    // A missing or malformed config is fine; env/flags still work.
  }

  return {
    configFile: defaultConfigPath(),
    githubRemote: flags.githubRemote || env.GITHUB_REMOTE || file.github?.remote || 'origin',
    giteeHost: flags.giteeHost || env.GITEE_HOST || file.gitee?.host || DEFAULT_GITEE_HOST,
    giteeOwner: flags.giteeOwner || env.GITEE_OWNER || file.gitee?.owner || '',
    giteeToken: env.GITEE_TOKEN || file.gitee?.token || '',
    cnbHost: flags.cnbHost || env.CNB_HOST || file.cnb?.host || DEFAULT_CNB_HOST,
    cnbApi: env.CNB_API || file.cnb?.api || DEFAULT_CNB_API,
    cnbGroup: flags.cnbGroup || env.CNB_GROUP || file.cnb?.group || '',
    cnbToken: env.CNB_TOKEN || file.cnb?.token || '',
    branch: flags.branch || env.BRANCH || file.branch || 'main',
    repo: flags.repo || env.REPO_NAME || file.repo || '',
  }
}
