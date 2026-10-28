# repo-all-sync 参考手册

本文件是 `SKILL.md` 的补充，记录完整参数、配置优先级、各平台行为和已知限制。

## 命令总览

```bash
repo-all-sync create  [--dry-run] [options]
repo-all-sync push    [--dry-run] [options]
repo-all-sync release --version <ver> | --tag <tag> [--assets <path>]... [--notes <file>] [--github] [--dry-run]
repo-all-sync doctor
repo-all-sync help
```

没有子命令或 `--help` 时打印用法。未知子命令返回退出码 1。
所有命令都要求当前目录在 Git 仓库内（通过 `git rev-parse --show-toplevel` 找根目录）。

## 参数

| 参数 | 适用命令 | 说明 |
| --- | --- | --- |
| `--repo <name>` | 全部 | 镜像仓库名；默认仓库根目录名 |
| `--branch <name>` | `push` | 推送的源分支；默认 `main` |
| `--gitee-owner <name>` | 全部 | Gitee 用户或组织；默认 `GITEE_OWNER`，再回退到 token 用户 |
| `--gitee-host <host>` | 全部 | Gitee 域名；默认 `GITEE_HOST` 或 `gitee.com` |
| `--cnb-group <name>` | 全部 | CNB 组/命名空间；默认 `CNB_GROUP` |
| `--cnb-host <host>` | 全部 | CNB 域名；默认 `CNB_HOST` 或 `cnb.cool` |
| `--github-remote <name>` | `create` / `push` | GitHub remote 名；默认 `origin` |
| `--github-owner <name>` | `create` | 在指定用户/组织下建 GitHub 仓库；默认当前 `gh` 账号 |
| `--version <ver>` | `release` | 版本号；tag 为 `v<ver>` |
| `--tag <tag>` | `release` | 直接指定 tag；已有 `v` 前缀则保留。与 `--version` 同时存在时以 `--tag` 为准 |
| `--assets <path>` | `release` | 资产文件或目录，可重复；目录只取第一层文件 |
| `--notes <file>` | `release` | release 说明文件；缺省用 tag 名 |
| `--github` | `release` | 同时创建/上传 GitHub release（走 `gh`） |
| `--config <file>` | 全部 | 覆盖 JSON 配置文件路径，等价于设置 `RAS_CONFIG` |
| `--dry-run` | `create` / `push` / `release` | 只打印计划，不产生任何写入 |
| `--json` | 全部 | 预留，目前不产生机器可读输出 |

未知参数会报 `unknown option --<name>`；需要值的参数缺失时报 `--<name> needs a value`。

## 配置

### 优先级

从高到低：

1. 命令行参数（只有上表中标注的参数）
2. 环境变量
3. JSON 配置文件（默认 `~/.config/repo-all-sync/config.json`，可用 `RAS_CONFIG` 或 `--config` 覆盖）
4. 内置默认值

token **没有**命令行参数，只从环境变量或配置文件读取。

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `GITHUB_REMOTE` | `origin` | GitHub remote 名 |
| `GITHUB_OWNER` | 空 | `create` 时的 GitHub 用户/组织 |
| `GITEE_HOST` | `gitee.com` | Gitee 域名 |
| `GITEE_OWNER` | 空 | Gitee 用户/组织 |
| `GITEE_TOKEN` | 空 | Gitee 私人令牌 |
| `CNB_HOST` | `cnb.cool` | CNB 域名 |
| `CNB_API` | `https://api.cnb.cool` | CNB API 根地址 |
| `CNB_GROUP` | 空 | CNB 组/命名空间 |
| `CNB_TOKEN` | 空 | CNB 访问令牌 |
| `BRANCH` | `main` | 推送分支 |
| `REPO_NAME` | 空 | 镜像仓库名；空时用目录名 |
| `RAS_CONFIG` | `~/.config/repo-all-sync/config.json` | 配置文件路径 |

### JSON 配置

```json
{
  "repo": "my-repo",
  "branch": "main",
  "github": {
    "remote": "origin",
    "owner": "my-org"
  },
  "gitee": {
    "host": "gitee.com",
    "owner": "my-gitee-name",
    "token": "..."
  },
  "cnb": {
    "host": "cnb.cool",
    "api": "https://api.cnb.cool",
    "group": "my-cnb-group",
    "token": "..."
  }
}
```

配置文件缺失或 JSON 格式错误会被静默忽略，环境变量仍然有效。建议 `chmod 600`，且不要提交到仓库。

### token 推荐存放方式

```bash
cp "${CLAUDE_PLUGIN_ROOT}/skills/repo-all-sync/tokens.env.example" ~/.config/repo-all-sync.env
chmod 600 ~/.config/repo-all-sync.env
set -a; source ~/.config/repo-all-sync.env; set +a
```

环境变量只在当前 shell 生效；新开终端需要重新 source。

## create：建仓 / 确认仓库

### GitHub

- 如果本地已存在 `<github-remote>`，直接跳过（即使远端仓库已被删除）。
- 否则执行：
  ```bash
  gh repo create <owner?>/<repo> --public --source=. --remote=<remote>
  ```
- `--github-owner` 为空时使用 `gh` 当前账号。
- `gh` 未安装或未登录会失败并返回 stderr。

### Gitee

- 先 `GET /api/v5/user` 判断 token 用户（失败时忽略）。
- `GITEE_OWNER` 为空时使用 token 用户的 login。
- owner 与 token 用户不同 → `POST /api/v5/orgs/<owner>/repos`；否则 `POST /api/v5/user/repos`。
- 创建为公开仓库，描述 `<repo> mirror`。
- HTTP 400 视为“已存在或名称不可用”，不中断；其他错误抛出。

### CNB

- 需要 `CNB_GROUP` 和 `CNB_TOKEN`。
- 需要本机安装 `cnb` CLI；未安装时只打印手动创建地址，不失败。
- 在临时 `HOME` 下写入 `.cnb/token`（权限 600），执行：
  ```bash
  cnb repositories create-repo --slug <group> --name <repo> --visibility public --description "<repo> mirror"
  ```
- 输出包含“已存在 / already exists”视为成功；其他失败只打印截断后的输出和手动创建地址。
- 临时目录在结束后删除。

`create --dry-run` 不要求 token（只打印计划）。

## push：推送源码

三个平台都只处理**已提交的 `HEAD`**：GitHub/Gitee 推送提交历史，CNB 导出 `HEAD` 的树。工作区里未提交的改动不会同步。

### GitHub

```bash
git push <remote> HEAD:refs/heads/<branch>
```

remote 不存在时直接报错，提示先运行 `create`。

### Gitee

- 地址：`https://<GITEE_HOST>/<gitee-owner>/<repo>.git`
- 使用 `Authorization: Basic base64(<owner>:<token>)`（通过临时 `-c http.extraHeader`，不出现在 remote URL 中）
- `HEAD:refs/heads/<branch>`
- 普通 fast-forward 推送；远端有分叉时会被拒绝，不会强推。

### CNB

CNB 推送的是当前树的快照：

1. `git archive HEAD` 并解包到临时目录。
2. `git init -b main`，设置 `user.name` / `user.email` 为当前 `HEAD` 的作者。
3. 关闭 LFS 过滤器（`filter.lfs.clean=cat` 等）后 `git add -A`，保留 LFS 指针文件。
4. 提交信息：`chore(mirror): sync main @ <sha>`。
5. 强推 `main:main` 到 `https://<CNB_HOST>/<group>/<repo>.git`，Basic 用户名为 `cnb`。

结果：CNB 上只有一个提交，没有历史；每次同步都会覆盖。`--branch` 只影响 GitHub/Gitee，CNB 始终是 `main`。

依赖系统 `tar` 命令。推送失败时会清理临时目录，不会留下快照仓库。

`push --dry-run` 打印三个目标地址和 refspec，不检查 token 和 remote。

## release：发布 release

### 通用流程

1. 解析 tag：`--tag` 优先；否则给 `--version` 加 `v` 前缀。
2. 展开 `--assets`（必须至少有一项，`--dry-run` 也一样）：
   - 文件 → 原样加入；
   - 目录 → **只取该目录第一层的普通文件**，忽略子目录；
   - 路径不存在 → `asset not found: <path>`；
   - 最终为空 → `no release assets found`。
3. 读取 `--notes` 文件内容（不存在则视为空）。
4. `--dry-run`：打印 tag、资产数量、Gitee/CNB release 地址、每个文件的 SHA-256 前 12 位；不要求 token。

### Gitee

- `GET /releases/tags/<tag>`；404 则 `POST /releases`（`target_commitish: main`）。
- 创建后最多轮询 10 秒确认 release 可查询。
- 列出 `/releases/<id>/attach_files?per_page=100`。
- 同名且大小相同的附件跳过；大小不同则删除旧附件再上传。
- 上传走 `POST /releases/<id>/attach_files`（multipart）。

### CNB

- `GET /-/releases/tags/<tag>`；404 则 `POST /-/releases` 创建 **draft** release。
- 每个资产：`POST /-/releases/<id>/asset-upload-url` 获取 `upload_url`，PUT 上传，再 POST `verify_url?ttl=0` 确认。
- 每次都上传，不做大小比对（`overwrite: true`）。
- 全部上传后 `PATCH /-/releases/<id>` 将 release 发布为正式版（`draft: false`, `make_latest: true`）。
- 请求头：`Authorization: Bearer <token>`、`Accept: application/vnd.cnb.api+json`。

### GitHub

只有加 `--github` 才执行：

- `gh release view <tag>` 不存在 → `gh release create <tag> --title <tag> [--notes-file <file> | --notes <tag>] <files...>`
- 已存在 → `gh release upload <tag> <files...> --clobber`

### 结束输出

非 dry-run 成功后会打印每个资产在两个平台的下载地址：

```
gitee: https://<host>/<owner>/<repo>/releases/download/<tag>/<name>
cnb:   https://<host>/<group>/<repo>/-/releases/download/<tag>/<name>
```

## doctor：环境自检

检查项：

- `node` 版本
- `git`、`gh`、`cnb` 是否可执行
- 当前使用的配置文件路径
- `GITEE_OWNER`、`GITEE_TOKEN`、`CNB_GROUP`、`CNB_TOKEN` 是否存在

输出形如：

```
ok   node: v22.x.x
ok   git: found
warn gh: missing (only needed for GitHub create/release)
ok   GITEE_TOKEN: set
warn CNB_TOKEN: missing
```

永远不会打印 token 值。进程退出码始终为 0（用于诊断，不代表配置完整）。

## 已知限制

- 不能只同步某一个平台：`create` / `push` / `release` 总是覆盖三个平台（`release` 的 GitHub 需显式开启）。
- CNB 源码镜像没有历史，且始终是 `main`。
- Gitee / CNB 的 release 目标分支固定为 `main`。
- 不生成应用更新清单；`manifest.json` 需要仓库脚本自行生成并作为资产传入。
- `--json` 目前没有实际输出。
- 网络请求没有重试和退避；失败需要重新执行（操作整体可重复，已存在的 release/附件会被复用）。
- Gitee 附件查重只读取第一页（最多 100 个）。
- `create` 对 GitHub 的判断依据是本地 remote，而不是远端仓库是否存在。

## 安全设计

- token 只从环境变量或配置文件读取。
- `git` 错误只输出 stderr，不回显带 `Authorization` 的 argv。
- CNB 临时 token 文件权限 600，并在结束后删除。
- CNB 快照临时目录在成功或失败后都会删除。
- `doctor` 与 dry-run 不输出 token。
- `create` 默认创建公开仓库；建仓前应向用户确认可见性是否符合预期。
