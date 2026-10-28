---
name: repo-all-sync
description: 把一个 Git 仓库同步到 GitHub、Gitee 和 CNB：创建或确认镜像仓库、推送源码、发布 release 并上传资产。当用户要求同步镜像、创建三平台仓库、推送代码到 Gitee/CNB，或在多个平台发布 release 时使用。
when_to_use: 用户说“同步仓库”“三平台同步”“创建镜像仓库”“推送到 Gitee/CNB”“发布 release 到多个平台”“上传 release 资产”等。
---

# 三平台仓库同步（GitHub / Gitee / CNB）

用 `repo-all-sync` CLI 完成全部操作。CLI 无运行时依赖，需要 Node.js >= 20；在 Git 仓库内的任意目录运行，它自己会找到仓库根目录。

本 skill 负责 **建仓、推送、发布**。不负责编译、打包、签名，也不生成应用自定义的更新清单（例如 wmlUpdate 的 `manifest.json`）——那些由仓库自己的脚本生成，再把产物/清单作为普通资产交给本 skill。

## 执行前必须遵守

1. **先 dry-run。** 三种命令第一次都先加 `--dry-run`，把要发生的事展示给用户。
2. **有外部副作用的操作要确认。** 去掉 `--dry-run` 后可能：创建公开仓库、强推 CNB 快照、创建 release、上传附件。用户本轮已明确说“执行/推送/发布”时可直接做；否则先确认。
3. **永远不要打印 token。** 不要把 `GITEE_TOKEN` / `CNB_TOKEN` 写进命令行、日志、提交、issue 或回复。`doctor` 只显示 `set` / `missing`。
4. **敏感文件留在仓库外。** `tokens.env`、`.env`、`~/.config/repo-all-sync/config.json` 不得被提交；自建文件用 `chmod 600`。
5. **不覆盖别人的仓库。** `create` 只补建缺失项，已存在的 GitHub remote / Gitee 仓库会被跳过。不要为了“让命令通过”去删除或重置远端。
6. **失败就如实报告。** 原样转述 CLI 的 stderr，不要猜测成功，也不要擅自加 `--force` 绕过错误。

## 1. 确认 CLI 可用

按顺序尝试，成功后全程使用同一个入口：

```bash
# 插件安装：插件根目录的 bin/ 已在当前会话 PATH 上
command -v repo-all-sync

# 插件内直接用绝对路径（${CLAUDE_PLUGIN_ROOT} 由 Claude Code 替换）
node "${CLAUDE_PLUGIN_ROOT}/bin/repo-all-sync.mjs" help

# 兜底：npm 上的同一 CLI
npx --yes repo-all-sync@0.2.1 help
```

如果 Node.js < 20，停止并告知用户先升级 Node。

## 2. 检查环境与配置

```bash
repo-all-sync doctor
```

`doctor` 会检查 `node`、`git`、`gh`、`cnb`、配置文件，以及四个关键变量是否存在（不会打印值）：

| 变量 | 用途 | 是否必需 |
| --- | --- | --- |
| `GITEE_OWNER` | Gitee 用户名或组织名 | 建议设置；未设置时用 token 反查用户 |
| `GITEE_TOKEN` | Gitee 私人令牌 | 建仓、推送、发版必需 |
| `CNB_GROUP` | CNB 组 / 命名空间 | 建仓、推送、发版必需 |
| `CNB_TOKEN` | CNB 访问令牌 | 建仓、推送、发版必需 |
| `GITEE_HOST` | 默认 `gitee.com` | 否 |
| `CNB_HOST` / `CNB_API` | 默认 `cnb.cool` / `https://api.cnb.cool` | 否 |

GitHub 不使用 `GITEE_TOKEN` / `CNB_TOKEN`，而是使用本机已登录的 `gh` 和现有 git remote；只有 `create` 和 `release --github` 需要 `gh`。
CNB 建仓还需要本机 `cnb` CLI；推送和发版走 HTTP API，不需要 `cnb`。

配置来源优先级：命令行参数（仅部分项） > 环境变量 > JSON 配置文件 > 默认值。
token 只从环境变量或配置文件读取，没有对应的命令行参数。

推荐把变量放进仓库外的私有文件，再 source：

```bash
cp "${CLAUDE_PLUGIN_ROOT}/skills/repo-all-sync/tokens.env.example" ~/.config/repo-all-sync.env
chmod 600 ~/.config/repo-all-sync.env
# 编辑后：
set -a; source ~/.config/repo-all-sync.env; set +a
```

或使用 JSON 配置 `~/.config/repo-all-sync/config.json`：

```json
{
  "branch": "main",
  "repo": "my-repo",
  "gitee": { "host": "gitee.com", "owner": "your-name", "token": "..." },
  "cnb":   { "host": "cnb.cool", "group": "your-group", "token": "..." },
  "github": { "remote": "origin", "owner": "" }
}
```

缺少 token 时先让用户补齐；`create --dry-run`、`push --dry-run`、`release --dry-run` 可以在没有 token 的情况下预演。

## 3. 建仓 / 确认镜像仓库

```bash
repo-all-sync create --dry-run
# 给用户看输出，确认后：
repo-all-sync create
```

行为：

- **GitHub**：如果本地没有指定 remote（默认 `origin`），执行
  `gh repo create <owner?>/<repo> --public --source=. --remote=<remote>`。
  已有 remote 则跳过。`--github-owner` 可指定用户或组织。
- **Gitee**：调用 Gitee API 建公开仓库；`--gitee-owner` 与 token 用户不同时按组织建仓。
  返回 400 视为“已存在或名称不可用”，继续。
- **CNB**：用 `cnb` CLI 在 `CNB_GROUP` 下建公开仓库；未安装 `cnb` 或建仓失败时只打印手动创建地址，不中断其他平台。

仓库名默认取仓库根目录名，可用 `--repo` 或 `REPO_NAME` 覆盖。
`create` 可反复执行，不会修改已有仓库。

## 4. 推送源码

```bash
repo-all-sync push --dry-run
# 确认后：
repo-all-sync push
```

三个平台的行为**不同**，向用户说明清楚：

| 平台 | 行为 | 历史 |
| --- | --- | --- |
| GitHub | `git push <remote> HEAD:<branch>` | 完整历史 |
| Gitee | 带 token 的 HTTPS fast-forward 推送 `<branch>` | 完整历史 |
| CNB | 导出当前 `HEAD` 的树，生成**单个提交**后强推 `main` | 只有快照，无历史 |

CNB 快照的细节：

- 只包含当前 `HEAD` 的内容，提交信息为 `chore(mirror): sync main @ <sha>`，作者沿用当前 `HEAD` 的作者。
- 保留 Git LFS 指针文件原样，不要求本地存在 LFS 对象。
- **始终推到 CNB 的 `main` 分支**，与 `--branch` 无关。
- 每次都是 force push；CNB 上的历史会被覆盖。

三个平台都只同步**已提交的 `HEAD`**；工作区里未提交的改动不会上传。推送前先确认用户已经提交（`git status`），不要替用户提交。

前置条件：GitHub remote 已存在（先 `create`），`GITEE_OWNER`/`GITEE_TOKEN`、`CNB_GROUP`/`CNB_TOKEN` 已配置。

## 5. 发布 release

```bash
repo-all-sync release --version 1.2.3 --assets dist --notes notes.md --dry-run
# 确认资产列表和大小后：
repo-all-sync release --version 1.2.3 --assets dist --notes notes.md
```

- `--version 1.2.3` 或 `--tag v1.2.3`；tag 默认加 `v` 前缀。
- `--assets` 可重复。**目录只取第一层文件，不递归**；需要子目录里的文件就逐个指定，或先在仓库脚本里汇总到一个目录。
- `--notes <file>` 作为 release 说明；缺省时用 tag 名。
- 默认只发 **Gitee + CNB**；加 `--github` 才通过 `gh` 创建/上传 GitHub release。
- 必须至少提供一项 `--assets`（`--dry-run` 也一样）；路径不存在或最终为空都会直接报错。

平台差异：

- **Gitee**：按 tag 查/建 release，再上传附件。同名且大小相同的附件跳过；大小变化时先删后传。
- **CNB**：先建 draft release，为每个资产申请上传 URL，PUT 上传并确认，最后把 release 发布为 latest。
- **GitHub**：`gh release view` 判断是否已存在；不存在则 `gh release create`，存在则 `gh release upload --clobber`。

注意：Gitee / CNB 的 release 目标分支在实现中固定为 `main`。如果同步的是其他分支，先确认该平台的 `main` 已包含目标提交。

## 6. 结果汇报

完成后向用户报告：

1. 三个平台的仓库地址（或“已存在/跳过”）。
2. 推送结果，并明确 CNB 是快照、无完整历史。
3. release 链接与每个资产的最终下载地址——CLI 会打印 Gitee / CNB 的下载 URL。
4. 任何被跳过的步骤、降级行为（例如 `cnb` 未安装）和失败原因。

```bash
# 需要复核时
repo-all-sync doctor
```

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `GitHub remote "origin" 不存在` | 先 `repo-all-sync create`，或 `--github-remote` 指向已有 remote |
| `缺少 GITEE_OWNER / GITEE_TOKEN` | 让用户设置环境变量或配置文件；不要在对话里回显 token |
| `缺少 CNB_GROUP / CNB_TOKEN` | 同上 |
| Gitee 401 / 403 | token 失效或权限不足；重新生成（仓库写 + release 写） |
| Gitee 400 | 仓库已存在或名称被占用；`create` 本身会容忍 |
| CNB 建仓失败但推送可用 | 让用户按打印的地址手动建仓，再执行 `push` |
| `no release assets found` | `--assets` 指向的目录为空或只包含子目录 |
| 上传到 CNB 失败 | 检查 token、仓库是否存在，以及资产大小是否超过平台限制 |
| 非 `main` 分支发版异常 | 说明 Gitee/CNB 建 release 时目标分支固定为 `main` |

## 更多资料

- 完整参数、配置优先级、平台 API 行为和限制：[reference.md](reference.md)
- 端到端场景（首次同步、发版、GitHub 组织、重复执行）：[examples.md](examples.md)
