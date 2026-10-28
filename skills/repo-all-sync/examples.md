# 端到端示例

以下示例假设 `repo-all-sync` 已在 PATH 上（插件安装即满足）。若没有，把命令替换为
`node "${CLAUDE_PLUGIN_ROOT}/bin/repo-all-sync.mjs"` 或 `npx --yes repo-all-sync@0.2.1`。

## 场景 1：新仓库首次同步到三个平台

用户说：“把这个仓库同步到 GitHub、Gitee 和 CNB。”

```bash
# 1. 先确认工具和 token（不会打印 token）
repo-all-sync doctor

# 2. 预演建仓
repo-all-sync create --dry-run
```

把 dry-run 输出给用户，确认仓库名、owner/group、公开可见性。然后：

```bash
repo-all-sync create
```

预期：GitHub 创建仓库并添加 `origin`；Gitee 创建公开仓库；CNB 在 group 下创建仓库。
已存在的项会跳过，CNB 缺少 `cnb` CLI 时会打印手动创建地址。

```bash
# 3. 预演推送，确认三个目标
repo-all-sync push --dry-run

# 4. 正式推送
repo-all-sync push
```

汇报时说明：GitHub/Gitee 是完整历史，CNB 是单提交快照、始终 `main`。

## 场景 2：日常提交后再次同步

```bash
git add -A && git commit -m "feat: ..."   # 由用户自己完成
repo-all-sync push
```

`push` 可以反复执行。Gitee 是 fast-forward；如果远端被其他人更新而本地未合并，推送会失败，
此时应让用户先 `git pull --rebase`，不要强推。CNB 每次都会用新快照覆盖 `main`。

## 场景 3：发布版本并上传构建产物

仓库的发布脚本先生成产物：

```
dist/
├── app-1.2.3.zip
├── app-1.2.3.zip.sha256
└── manifest.json          # 应用自己的更新清单
```

```bash
repo-all-sync release --version 1.2.3 \
  --assets dist \
  --notes CHANGELOG-1.2.3.md \
  --dry-run
```

检查输出中的资产数量、文件名和哈希。确认后去掉 `--dry-run`：

```bash
repo-all-sync release --version 1.2.3 \
  --assets dist \
  --notes CHANGELOG-1.2.3.md
```

结果：Gitee 与 CNB 各有 `v1.2.3` release，包含 `dist` 第一层的三个文件。
若要同时发 GitHub：

```bash
repo-all-sync release --version 1.2.3 --assets dist --notes CHANGELOG-1.2.3.md --github
```

注意：

- `dist` 下的子目录不会被递归上传。需要时把文件汇总到同一层，或重复传多个 `--assets`。
- 清单文件仅作为普通资产上传，本 CLI 不生成它。
- 重复执行时，Gitee 上同名同大小的附件会跳过；CNB 会全部重传后再发布。

## 场景 4：GitHub 仓库建在组织下

```bash
repo-all-sync create --github-owner my-org --dry-run
repo-all-sync create --github-owner my-org
```

对应命令为 `gh repo create my-org/<repo> --public --source=. --remote=origin`。
需要当前 `gh` 账号对 `my-org` 有建仓权限。Gitee/CNB 仍使用各自配置的 owner/group。

如果本地已经有一个非 `origin` 的 GitHub remote：

```bash
repo-all-sync create --github-remote upstream   # remote 已存在 → 跳过建仓
repo-all-sync push   --github-remote upstream
```

## 场景 5：仓库名与目录名不同

目录叫 `my-app-web`，但希望三平台仓库都叫 `my-app`：

```bash
repo-all-sync create  --repo my-app --dry-run
repo-all-sync push    --repo my-app --dry-run
repo-all-sync release --repo my-app --version 2.0.0 --assets dist --dry-run
```

或导出 `REPO_NAME=my-app`。所有命令必须使用同一个 `--repo`，否则会操作到不同仓库。

## 场景 6：非 `main` 分支

```bash
repo-all-sync push --branch release/2.x
```

GitHub/Gitee 会推送 `release/2.x`，但：

- CNB 仍然只接收 `main` 快照。
- 发 release 时 Gitee/CNB 的 `target_commitish` 固定为 `main`。

如果目标提交只存在于非 `main` 分支，先向用户说明，必要时把该提交合并到 `main` 再发版。

## 场景 7：失败排查顺序

```bash
repo-all-sync doctor
repo-all-sync create --dry-run
repo-all-sync push --dry-run
repo-all-sync release --version <ver> --assets <dir> --dry-run
```

按以下顺序定位：

1. `node` 版本是否 >= 20。
2. 当前目录是否在 Git 仓库内。
3. `GITEE_OWNER` / `GITEE_TOKEN` / `CNB_GROUP` / `CNB_TOKEN` 是否齐全。
4. GitHub remote 是否存在（`git remote -v`）。
5. `gh auth status`（仅 GitHub 建仓/发版）。
6. Gitee/CNB API 返回的状态码；401/403 是凭据问题，404 多为仓库名或路径不对，400 多为仓库已存在或名称冲突。
7. 资产路径是否存在、目录第一层是否有文件。

把 CLI 的原始错误信息反馈给用户，不要自行猜测或用 `--force` 绕过。
