---
name: repo-all-sync
description: Sync a git repository to GitHub, Gitee and CNB — create mirror repos, push source, and publish release assets. Use when the user asks to sync mirrors or publish a release to multiple platforms.
---

# 三平台仓库同步（GitHub / Gitee / CNB）

这是一个本地 skill，底层调用 [`repo-all-sync`](https://www.npmjs.com/package/repo-all-sync) CLI；
在任意 Git 仓库根目录运行。

## 初始化 token

```bash
cp tokens.env.example tokens.env
chmod 600 tokens.env
# 填入 GITEE_TOKEN / CNB_TOKEN / GITEE_OWNER / CNB_GROUP
set -a; source tokens.env; set +a
```

GitHub 使用本机已登录的 `gh` / git 凭据；CNB 的建仓步骤需要本机安装 `cnb` CLI。

## 命令

```bash
# 创建/确认三个平台的仓库（不改变任何现有仓库）
npx --yes repo-all-sync create --dry-run
npx --yes repo-all-sync create

# 推送当前 main
npx --yes repo-all-sync push --dry-run
npx --yes repo-all-sync push

# 发布资产到 Gitee / CNB（可选加 --github）
npx --yes repo-all-sync release --version 1.2.3 \
  --assets dist --notes notes.md --dry-run
npx --yes repo-all-sync release --version 1.2.3 \
  --assets dist --notes notes.md
```

可用环境变量覆盖仓库名/分支：`REPO_NAME`、`BRANCH`、`GITEE_OWNER`、`CNB_GROUP`。
