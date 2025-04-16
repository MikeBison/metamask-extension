# MetaMask 浏览器扩展

你可以在[我们的官方网站](https://metamask.io/)找到 MetaMask 的最新版本。如需使用帮助，请访问我们的[用户支持网站](https://support.metamask.io/)。

如有[常见问题](https://community.metamask.io/c/learn/26)、[功能请求](https://community.metamask.io/c/feature-requests-ideas/13)或[开发者问题](https://community.metamask.io/c/developer-questions/11)，请访问我们的[社区论坛](https://community.metamask.io/)。

MetaMask 支持 Firefox、Google Chrome 以及基于 Chromium 的浏览器。我们建议使用最新版本的浏览器。

获取最新资讯，请关注我们的 [X](https://x.com/MetaMask)。

如需了解如何开发兼容 MetaMask 的应用，请访问我们的[开发者文档](https://docs.metamask.io/)。

如需了解如何为 MetaMask 代码库做贡献，请访问我们的[贡献者文档](https://github.com/MetaMask/contributor-docs)。

如需了解如何为 MetaMask Extension 项目本身做贡献，请访问我们的[扩展文档](https://github.com/MetaMask/metamask-extension/tree/main/docs)。

## GitHub Codespaces 快速开始

作为在本地构建的替代方案，现在有一个新选项，可以通过 GitHub Codespaces 在不到 5 分钟内启动开发环境。请注意有[每月免费额度限制](https://docs.github.com/en/billing/managing-billing-for-github-codespaces/about-billing-for-github-codespaces)，超出后 GitHub 会开始收费。

_注意：你将为运行时间和存储空间付费_

[![在 GitHub Codespaces 中打开](https://github.com/codespaces/badge.svg)](https://codespaces.new/MetaMask/metamask-extension?quickstart=1)

1. 首先点击上方按钮
2. 会打开一个新的浏览器标签页，加载远程版 Visual Studio Code（加载需要几分钟）
3. “Simple Browser” 会在浏览器内打开 noVNC —— 点击 Connect
   - 可选步骤：
     - 点击 Simple Browser 标签页右上角的按钮，将 noVNC 窗口单独打开
     - 打开 noVNC 左侧边栏，点击齿轮图标，将 Scaling Mode 改为 Remote Resizing
4. 首次启动时多等约 20 秒，等待脚本执行完毕
5. 右键 noVNC 桌面，启动已预装 MetaMask 的 Chrome 或 Firefox
6. 修改代码后，运行 `yarn start` 以开发模式构建
7. 一两分钟后构建完成，你可以在 noVNC 桌面查看更改效果

### 降低 Codespaces 使用量的小贴士

- 你将为运行时间和存储空间付费
- Codespaces 在 30 分钟无操作后会暂停，30 天无操作后会自动删除
- 你可以在此管理你的 Codespaces：https://github.com/codespaces
  - 可以在 30 分钟超时前手动暂停
  - 如果有多个闲置的 Codespaces 挂了好几天，很快就会用完存储额度。请删除不再使用的 Codespaces，长期建议只保留 1~2 个。你也可以复用旧 Codespaces 并切换分支，而不是每次新建和删除。

### 在 Fork 上使用 Codespaces

如果你不是 MetaMask 内部开发者，或在 fork 上开发，默认的 Infura key 属于免费计划，请求速率非常有限。如果你想用自己的 Infura key，请参考[本地构建](#building-on-your-local-machine)章节中的 `.metamaskrc` 和 `INFURA_PROJECT_ID` 说明。

## 本地构建

- 安装 [Node.js](https://nodejs.org) 20 版本

  - 如果你使用 [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)（推荐），运行 `nvm use` 会自动选择正确的 node 版本。

- 在 metamask-extension 项目目录下执行 `corepack enable` 启用 Corepack。Corepack 是 Node.js 默认包含的工具，用于按项目管理 Yarn，使用 `package.json` 中 `packageManager` 指定的版本。请注意，现代版本的 [Yarn](https://yarnpkg.com/getting-started/install) 不建议全局或通过 npm 安装。
- 在根目录下复制 `.metamaskrc.dist` 并重命名为 `.metamaskrc`，可通过命令 `cp .metamaskrc{.dist,}` 完成。

  - 将 `INFURA_PROJECT_ID` 替换为你自己的 [Infura API Key](https://docs.infura.io/networks/ethereum/how-to/secure-a-project/project-id)。
    - 如果没有 Infura 账号，可以在 [Infura 官网](https://app.infura.io/register) 免费注册。
  - 如果调试 MetaMetrics，需要为 `SEGMENT_WRITE_KEY` 添加值，详见 [MetaMask 开发 - Segment](./development/README.md#segment)。
  - 如果调试未处理异常，需要为 `SENTRY_DSN` 添加值，详见 [MetaMask 开发 - Sentry](./development/README.md#sentry)。
  - 可选：将 `PASSWORD` 替换为你的开发钱包密码，避免每次打开应用都要输入。
  - 如果需要远程特性开关，并希望在构建过程中覆盖这些开关，可以在项目根目录添加 `.manifest-overrides.json` 文件，并在 `.metamaskrc` 中设置 `MANIFEST_OVERRIDES=.manifest-overrides.json`。该文件用于为扩展的 `manifest.json` 构建文件添加标志。你也可以在 `dist/browser` 目录下已构建的 `manifest.json` 文件中修改 `_flags.remoteFeatureFlags`，以便在构建后调整开关（但再次构建会覆盖这些更改）。
    例如，远程特性开关覆盖的写法如下:

  ```json
  {
    "_flags": {
      "remoteFeatureFlags": { "testBooleanFlag": false }
    }
  }
  ```

- 运行 `yarn install` 安装依赖。
- 使用 `yarn dist`（适用于 Chromium 内核浏览器）或 `yarn dist:mv2`（适用于 Firefox）将项目构建到 `./dist/` 文件夹。

  - 可选：如需创建开发构建，可以运行 `yarn start`（Chromium 内核浏览器）或 `yarn start:mv2`（Firefox）。
  - 未压缩的构建产物在 `/dist`，压缩后的构建产物在 `/builds`（构建完成后生成）。
  - 有关构建系统的使用信息，请参阅 [build system readme](./development/build/README.md)。

- 按照以下说明验证你的本地构建是否能正常运行：
  - [如何将自定义构建添加到 Chrome](./docs/add-to-chrome.md)
  - [如何将自定义构建添加到 Firefox](./docs/add-to-firefox.md)

## Git 钩子

为了在提交代码前快速获得我们共享的代码质量检测反馈，你可以使用 Husky 安装我们的 git 钩子。

`$ yarn githooks:install`

你可以在我们的[测试文档](./docs/testing.md#fitness-functions-measuring-progress-in-code-quality-and-preventing-regressions-using-custom-git-hooks)中了解更多相关内容。

如果你在 VS Code 中因 "command not found" 错误无法通过源代码管理侧边栏提交代码，请参考 [Husky 文档](https://typicode.github.io/husky/troubleshooting.html#command-not-found)中的解决方法。

## 贡献

### 开发构建

要启动开发构建（如带日志和文件监听），运行 `yarn start`。

#### 带钱包状态的开发构建

你可以通过在 `.metamaskrc` 文件中添加 `TEST_SRP='<在此插入 SRP>'` 和 `PASSWORD='<在此插入钱包密码>'`，以预加载钱包状态启动开发构建。然后你有如下选项：

1. 运行 `yarn start:with-state`，使用默认的 fixture 标志启动钱包。
2. 运行 `yarn start:with-state --help`，查看可用的 fixture 标志列表。
3. 运行 `yarn start:with-state --FIXTURE_NAME=VALUE`，例如 `yarn start:with-state --withAccounts=100`，用自定义 fixture 标志启动钱包。你可以传递任意多个标志，其余 fixture 会采用默认值。

#### 使用 Webpack 的开发构建

你也可以通过 `yarn webpack` 或 `yarn webpack --watch` 启动开发构建。这会使用一个更快但尚未生产可用的替代构建系统。更多信息见 [Webpack README](./development/webpack/README.md)。

#### React 和 Redux DevTools

要启动 [React DevTools](https://github.com/facebook/react-devtools)，在浏览器中安装了开发构建后运行 `yarn devtools:react`。这会在单独窗口打开，无需浏览器扩展。

要启动 [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools/tree/main/extension)：

- 全局安装 `remotedev-server` 包（如 `yarn global add remotedev-server`）
- 安装 Redux Devtools 扩展
- 打开 Redux DevTools 扩展，在 Remote DevTools 设置中勾选 "Use custom (local) server"，使用默认服务器配置（主机 `localhost`，端口 `8000`，不勾选安全连接）

然后在浏览器中安装了开发构建后运行 `yarn devtools:redux`，即可用 Redux DevTools 扩展检查 MetaMask。

要同时创建开发构建并运行这两个工具，运行 `yarn start:dev`。

#### 测试 Dapp

[这个测试站点](https://metamask.github.io/test-dapp/) 可用于执行不同的用户流程。

### 运行单元测试和代码检查

运行 `yarn test` 可同时执行单元测试和代码检查。仅运行单元测试可用 `yarn test:unit`。

你可以单独运行代码检查 `yarn lint`，也可以用 `yarn lint:fix` 自动修复部分问题。还可以用 `yarn lint:changed` 和 `yarn lint:changed:fix` 仅对本地更改的文件执行上述操作，以节省时间。

Node.js 下的 Jest 调试指南见 [docs/tests/jest.md](docs/tests/jest.md)。

### 运行 E2E 测试

我们的 e2e 测试套件可在 Firefox 或 Chrome 上运行。以下是 e2e 测试的入门方法：

#### 准备测试构建

在运行 e2e 测试前，确保已运行 `yarn install` 下载依赖。接下来你需要一个测试构建，有三种方式：

1. 使用 `yarn download-builds:test`，快速下载并解压 Chrome 和 Firefox 的测试构建到 `./dist/` 文件夹。此方法快捷方便，适合标准测试。
2. 创建自定义测试构建：如需针对不同构建类型测试，使用 `yarn build:test`。该命令可生成多种类型的测试构建，包括：
   - `yarn build:test` 主构建
   - `yarn build:test:flask` flask 构建
   - `yarn build:test:mv2` mv2 构建
   - `yarn build:test:mmi` mmi 构建
3. 启动带实时变更的测试构建：`yarn start:test` 特别适合开发。它会启动一个测试构建，应用代码变更后会自动重新编译。此选项非常适合迭代测试和开发。该命令同样支持多种类型的测试构建，包括：
   - `yarn start:test` 主构建
   - `yarn start:test:flask` flask 构建
   - `yarn start:test:mv2` mv2 构建

注意：`yarn start:test` 命令（即 testDev 构建类型）会在构建系统和应用中禁用 LavaMoat，便于开发时流畅测试。而 `yarn build:test` 则会在构建系统和应用中启用 LavaMoat，更接近生产环境的安全性。

#### 运行测试

当你准备好测试构建后，选择用于 e2e 测试的浏览器：

- Firefox：运行 `yarn test:e2e:firefox`
  - 注意：如果你在 Linux 上以 snap 包方式运行 Firefox，请确保设置了环境变量：`FIREFOX_SNAP=true yarn test:e2e:firefox`
- Chrome：运行 `yarn test:e2e:chrome`

这些脚本支持更多调试选项，使用 `--help` 查看所有可用选项。

#### 运行单个 e2e 测试

可以使用 `yarn test:e2e:single test/e2e/tests/TEST_NAME.spec.js` 命令结合下方参数运行单个 e2e 测试。

```console
  --browser           Set the browser to be used; specify 'chrome', 'firefox', 'all'
                      or leave unset to run on 'all' by default.
                                                          [string] [default: 'all']
  --debug             Run tests in debug mode, logging each driver interaction
                                                         [boolean] [default: true]
  --retries           Set how many times the test should be retried upon failure.
                                                              [number] [default: 0]
  --leave-running     Leaves the browser running after a test fails, along with
                      anything else that the test used (ganache, the test dapp,
                      etc.)                              [boolean] [default: false]
  --update-snapshot   Update E2E test snapshots
                                             [alias: -u] [boolean] [default: false]
```

例如，要在 Chrome 上运行 `account-details` 测试，并启用调试日志且在失败时保持浏览器窗口不关闭，可以使用如下命令：
`yarn test:e2e:single test/e2e/tests/account-menu/account-details.spec.js --browser=chrome --leave-running`

#### 针对特性开关运行 e2e 测试

在开发新功能时，我们经常会用到特性开关。当准备将这些功能正式发布（GA）时，我们会移除特性开关。现有的特性开关可以在 `.metamaskrc.dist` 文件中找到。要在启用某个特性开关的情况下运行 e2e 测试，首先需要生成一个启用了该特性开关的测试构建。有两种方式：

- 在本地配置中启用特性开关：首先确保你已经将 `.metamaskrc.dist` 复制为 `.metamaskrc`。然后在本地 `.metamaskrc` 文件中将所需的特性开关设置为 true。之后，执行 `yarn build:test` 即可生成带有该特性开关的测试构建。

- 或者，也可以在创建测试构建时直接通过命令行参数启用特性开关。例如，启用 MULTICHAIN 特性开关可以运行 `MULTICHAIN=1 yarn build:test` 或 `MULTICHAIN=1 yarn start:test`。这种方式可以快速调整特性开关，无需修改 `.metamaskrc` 文件。

当你生成了带有目标特性开关的测试构建后，像平常一样运行测试即可。此时你的测试会基于已启用该特性开关的扩展版本。例如：
`yarn test:e2e:single test/e2e/tests/account-menu/account-details.spec.js --browser=chrome`

这种方式可以确保你的 e2e 测试准确反映即将 GA 的新功能的用户体验。

#### 针对不同构建类型运行 e2e 测试

不同的构建类型有各自对应的 e2e 测试集。要运行这些测试，请在 `package.json` 文件中查找相关命令。例如：

```console
    "test:e2e:chrome:snaps": "SELENIUM_BROWSER=chrome node test/e2e/run-all.js --snaps",
    "test:e2e:firefox": "SELENIUM_BROWSER=firefox node test/e2e/run-all.js",
```

### 依赖变更

每当你更改依赖（无论是添加、删除还是更新 `package.json` 或 `yarn.lock`），都需要同步维护多个文件：

- `yarn.lock`：
  - 依赖变更后再次运行 `yarn`，确保 `yarn.lock` 已正确更新。
  - 运行 `yarn lint:lockfile:dedupe:fix`，去除 lockfile 中的重复依赖。
- `package.json` 中的 `allow-scripts` 配置
  - 运行 `yarn allow-scripts auto` 自动更新 `allow-scripts` 配置。该配置决定哪些包的 install/postinstall 脚本被允许执行。每次引入新包时请检查是否需要运行 install 脚本，并视情况测试。
  - 注意：`yarn allow-scripts auto` 在不同平台上表现不一致。macOS 和 Windows 用户可能会看到与可选依赖相关的多余变更。
- LavaMoat 策略文件
  - 如果你是 MetaMask 团队成员且 PR 在仓库分支上，可以用机器人命令 `@metamaskbot update-policies` 让 MetaMask 机器人自动更新策略文件。
  - 如果你的 PR 来自 fork，可以请团队成员协助更新策略文件。
  - 手动更新方法：简而言之，运行 `yarn lavamoat:auto` 更新这些文件，但细节上需注意：
    - LavaMoat 策略文件分为两套：
      - 生产环境策略文件（`lavamoat/browserify/*/policy.json`），通过 `yarn lavamoat:webapp:auto` 重新生成。可加 `--help` 查看用法。
        - 每当 webapp 的生产依赖变更时都应重新生成。
      - 构建系统策略文件（`lavamoat/build-system/policy.json`），通过 `yarn lavamoat:build:auto` 重新生成。
        - 每当构建系统自身依赖变更时都应重新生成。
    - 每次重新生成策略文件后，请检查变更，确保每个包的访问权限合理。
    - 注意：`yarn lavamoat:auto` 在不同平台上表现不一致。macOS 和 Windows 用户可能会看到与可选依赖相关的多余变更。
    - 如果多次重新生成策略文件后仍遇到策略失败，建议先清理依赖再重试：
      - `rm -rf node_modules/ && yarn && yarn lavamoat:auto`
    - 注意，任何动态 import 或全局变量的动态用法都可能绕过 LavaMoat 的静态分析。遇到问题请查阅 LavaMoat 文档或寻求帮助。
- 归属文件（Attributions file）
  - 如果你是 MetaMask 团队成员且 PR 在仓库分支上，可以用机器人命令 `@metamaskbot update-attributions` 让 MetaMask 机器人自动更新归属文件。
  - 手动更新：运行 `yarn attributions:generate`。

## 架构

- [2022 年夏季控制器层级与依赖关系可视化](https://gist.github.com/rekmarks/8dba6306695dcd44967cce4b6a94ae33)
- [整个代码库的可视化](https://mango-dune-07a8b7110.1.azurestaticapps.net/?repo=metamask%2Fmetamask-extension)

[![架构图](./docs/architecture.png)][1]

## 其他文档

- [如何为 MetaMask 添加新翻译](./docs/translating-guide.md)
- [发布指南](./docs/publishing.md)
- [如何使用 TREZOR 模拟器](./docs/trezor-emulator.md)
- [MetaMask 开发文档](./development/README.md)
- [如何生成本仓库开发过程的可视化图](./development/gource-viz.sh)
- [如何添加新确认](./docs/confirmations.md)
- [浏览器支持指南](./docs/browser-support.md)

## Dapp 开发者资源

- [用 MetaMask Snaps 扩展 MetaMask 功能](https://docs.metamask.io/snaps/)
- [提示用户添加并切换到新网络](https://docs.metamask.io/wallet/how-to/add-network/)
- [更改你的 dapp 连接 MetaMask 时显示的图标](https://docs.metamask.io/wallet/how-to/display/icon/)

[1]: http://www.nomnoml.com/#view/%5B%3Cactor%3Euser%5D%0A%0A%5Bmetamask-ui%7C%0A%20%20%20%5Btools%7C%0A%20%20%20%20%20react%0A%20%20%20%20%20redux%0A%20%20%20%20%20thunk%0A%20%20%20%20%20ethUtils%0A%20%20%20%20%20jazzicon%0A%20%20%20%5D%0A%20%20%20%5Bcomponents%7C%0A%20%20%20%20%20app%0A%20%20%20%20%20account-detail%0A%20%20%20%20%20accounts%0A%20%20%20%20%20locked-screen%0A%20%20%20%20%20restore-vault%0A%20%20%20%20%20identicon%0A%20%20%20%20%20config%0A%20%20%20%20%20info%0A%20%20%20%5D%0A%20%20%20%5Breducers%7C%0A%20%20%20%20%20app%0A%20%20%20%20%20metamask%0A%20%20%20%20%20identities%0A%20%20%20%5D%0A%20%20%20%5Bactions%7C%0A%20%20%20%20%20%5BbackgroundConnection%5D%0A%20%20%20%5D%0A%20%20%20%5Bcomponents%5D%3A-%3E%5Bactions%5D%0A%20%20%20%5Bactions%5D%3A-%3E%5Breducers%5D%0A%20%20%20%5Breducers%5D%3A-%3E%5Bcomponents%5D%0A%5D%0A%0A%5Bweb%20dapp%7C%0A%20%20%5Bui%20code%5D%0A%20%20%5Bweb3%5D%0A%20%20%5Bmetamask-inpage%5D%0A%20%20%0A%20%20%5B%3Cactor%3Eui%20developer%5D%0A%20%20%5Bui%20developer%5D-%3E%5Bui%20code%5D%0A%20%20%5Bui%20code%5D%3C-%3E%5Bweb3%5D%0A%20%20%5Bweb3%5D%3C-%3E%5Bmetamask-inpage%5D%0A%5D%0A%0A%5Bmetamask-background%7C%0A%20%20%5Bprovider-engine%5D%0A%20%20%5Bhooked%20wallet%20subprovider%5D%0A%20%20%5Bid%20store%5D%0A%20%20%0A%20%20%5Bprovider-engine%5D%3C-%3E%5Bhooked%20wallet%20subprovider%5D%0A%20%20%5Bhooked%20wallet%20subprovider%5D%3C-%3E%5Bid%20store%5D%0A%20%20%5Bconfig%20manager%7C%0A%20%20%20%20%5Brpc%20configuration%5D%0A%20%20%20%20%5Bencrypted%20keys%5D%0A%20%20%20%20%5Bwallet%20nicknames%5D%0A%20%20%5D%0A%20%20%0A%20%20%5Bprovider-engine%5D%3C-%5Bconfig%20manager%5D%0A%20%20%5Bid%20store%5D%3C-%3E%5Bconfig%20manager%5D%0A%5D%0A%0A%5Buser%5D%3C-%3E%5Bmetamask-ui%5D%0A%0A%5Buser%5D%3C%3A--%3A%3E%5Bweb%20dapp%5D%0A%0A%5Bmetamask-contentscript%7C%0A%20%20%5Bplugin%20restart%20detector%5D%0A%20%20%5Brpc%20passthrough%5D%0A%5D%0A%0A%5Brpc%20%7C%0A%20%20%5Bethereum%20blockchain%20%7C%0A%20%20%20%20%5Bcontracts%5D%0A%20%20%20%20%5Baccounts%5D%0A%20%20%5D%0A%5D%0A%0A%5Bweb%20dapp%5D%3C%3A--%3A%3E%5Bmetamask-contentscript%5D%0A%5Bmetamask-contentscript%5D%3C-%3E%5Bmetamask-background%5D%0A%5Bmetamask-background%5D%3C-%3E%5Bmetamask-ui%5D%0A%5Bmetamask-background%5D%3C-%3E%5Brpc%5D%0A

```json
{
  "_flags": {
    "remoteFeatureFlags": { "testBooleanFlag": false }
  }
}
```

- 运行 `yarn install` 安装依赖。
- 使用 `yarn dist`（适用于 Chromium 内核浏览器）或 `yarn dist:mv2`（适用于 Firefox）将项目构建到 `./dist/` 文件夹。

  - 可选：如需创建开发构建，可以运行 `yarn start`（Chromium 内核浏览器）或 `yarn start:mv2`（Firefox）。
  - 未压缩的构建产物在 `/dist`，压缩后的构建产物在 `/builds`（构建完成后生成）。
  - 有关构建系统的使用信息，请参阅 [build system readme](./development/build/README.md)。

- 按照以下说明验证你的本地构建是否能正常运行：
  - [如何将自定义构建添加到 Chrome](./docs/add-to-chrome.md)
  - [如何将自定义构建添加到 Firefox](./docs/add-to-firefox.md)

## Git 钩子

为了在提交代码前快速获得我们共享的代码质量检测反馈，你可以使用 Husky 安装我们的 git 钩子。

`$ yarn githooks:install`

你可以在我们的[测试文档](./docs/testing.md#fitness-functions-measuring-progress-in-code-quality-and-preventing-regressions-using-custom-git-hooks)中了解更多相关内容。

如果你在 VS Code 中因 "command not found" 错误无法通过源代码管理侧边栏提交代码，请参考 [Husky 文档](https://typicode.github.io/husky/troubleshooting.html#command-not-found)中的解决方法。

## 贡献

### 开发构建

要启动开发构建（如带日志和文件监听），运行 `yarn start`。

#### 带钱包状态的开发构建

你可以通过在 `.metamaskrc` 文件中添加 `TEST_SRP='<在此插入 SRP>'` 和 `PASSWORD='<在此插入钱包密码>'`，以预加载钱包状态启动开发构建。然后你有如下选项：

1. 运行 `yarn start:with-state`，使用默认的 fixture 标志启动钱包。
2. 运行 `yarn start:with-state --help`，查看可用的 fixture 标志列表。
3. 运行 `yarn start:with-state --FIXTURE_NAME=VALUE`，例如 `yarn start:with-state --withAccounts=100`，用自定义 fixture 标志启动钱包。你可以传递任意多个标志，其余 fixture 会采用默认值。

#### 使用 Webpack 的开发构建

你也可以通过 `yarn webpack` 或 `yarn webpack --watch` 启动开发构建。这会使用一个更快但尚未生产可用的替代构建系统。更多信息见 [Webpack README](./development/webpack/README.md)。

#### React 和 Redux DevTools

要启动 [React DevTools](https://github.com/facebook/react-devtools)，在浏览器中安装了开发构建后运行 `yarn devtools:react`。这会在单独窗口打开，无需浏览器扩展。

要启动 [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools/tree/main/extension)：

- 全局安装 `remotedev-server` 包（如 `yarn global add remotedev-server`）
- 安装 Redux Devtools 扩展
- 打开 Redux DevTools 扩展，在 Remote DevTools 设置中勾选 "Use custom (local) server"，使用默认服务器配置（主机 `localhost`，端口 `8000`，不勾选安全连接）

然后在浏览器中安装了开发构建后运行 `yarn devtools:redux`，即可用 Redux DevTools 扩展检查 MetaMask。

要同时创建开发构建并运行这两个工具，运行 `yarn start:dev`。

#### 测试 Dapp

[这个测试站点](https://metamask.github.io/test-dapp/) 可用于执行不同的用户流程。

### 运行单元测试和代码检查

运行 `yarn test` 可同时执行单元测试和代码检查。仅运行单元测试可用 `yarn test:unit`。

你可以单独运行代码检查 `yarn lint`，也可以用 `yarn lint:fix` 自动修复部分问题。还可以用 `yarn lint:changed` 和 `yarn lint:changed:fix` 仅对本地更改的文件执行上述操作，以节省时间。

Node.js 下的 Jest 调试指南见 [docs/tests/jest.md](docs/tests/jest.md)。

### 运行 E2E 测试

我们的 e2e 测试套件可在 Firefox 或 Chrome 上运行。以下是 e2e 测试的入门方法：

#### 准备测试构建

在运行 e2e 测试前，确保已运行 `yarn install` 下载依赖。接下来你需要一个测试构建，有三种方式：

1. 使用 `yarn download-builds:test`，快速下载并解压 Chrome 和 Firefox 的测试构建到 `./dist/` 文件夹。此方法快捷方便，适合标准测试。
2. 创建自定义测试构建：如需针对不同构建类型测试，使用 `yarn build:test`。该命令可生成多种类型的测试构建，包括：
   - `yarn build:test` 主构建
   - `yarn build:test:flask` flask 构建
   - `yarn build:test:mv2` mv2 构建
   - `yarn build:test:mmi` mmi 构建
3. 启动带实时变更的测试构建：`yarn start:test` 特别适合开发。它会启动一个测试构建，应用代码变更后会自动重新编译。此选项非常适合迭代测试和开发。该命令同样支持多种类型的测试构建，包括：
   - `yarn start:test` 主构建
   - `yarn start:test:flask` flask 构建
   - `yarn start:test:mv2` mv2 构建

注意：`yarn start:test` 命令（即 testDev 构建类型）会在构建系统和应用中禁用 LavaMoat，便于开发时流畅测试。而 `yarn build:test` 则会在构建系统和应用中启用 LavaMoat，更接近生产环境的安全性。

#### 运行测试

当你准备好测试构建后，选择用于 e2e 测试的浏览器：

- Firefox：运行 `yarn test:e2e:firefox`
  - 注意：如果你在 Linux 上以 snap 包方式运行 Firefox，请确保设置了环境变量：`FIREFOX_SNAP=true yarn test:e2e:firefox`
- Chrome：运行 `yarn test:e2e:chrome`

这些脚本支持更多调试选项，使用 `--help` 查看所有可用选项。

#### 运行单个 e2e 测试

可以使用 `yarn test:e2e:single test/e2e/tests/TEST_NAME.spec.js` 命令结合下方参数运行单个 e2e 测试。

```console
  --browser           Set the browser to be used; specify 'chrome', 'firefox', 'all'
                      or leave unset to run on 'all' by default.
                                                          [string] [default: 'all']
  --debug             Run tests in debug mode, logging each driver interaction
                                                         [boolean] [default: true]
  --retries           Set how many times the test should be retried upon failure.
                                                              [number] [default: 0]
  --leave-running     Leaves the browser running after a test fails, along with
                      anything else that the test used (ganache, the test dapp,
                      etc.)                              [boolean] [default: false]
  --update-snapshot   Update E2E test snapshots
                                             [alias: -u] [boolean] [default: false]
```

例如，要在 Chrome 上运行 `account-details` 测试，并启用调试日志且在失败时保持浏览器窗口不关闭，可以使用如下命令：
`yarn test:e2e:single test/e2e/tests/account-menu/account-details.spec.js --browser=chrome --leave-running`

#### 针对特性开关运行 e2e 测试

在开发新功能时，我们经常会用到特性开关。当准备将这些功能正式发布（GA）时，我们会移除特性开关。现有的特性开关可以在 `.metamaskrc.dist` 文件中找到。要在启用某个特性开关的情况下运行 e2e 测试，首先需要生成一个启用了该特性开关的测试构建。有两种方式：

- 在本地配置中启用特性开关：首先确保你已经将 `.metamaskrc.dist` 复制为 `.metamaskrc`。然后在本地 `.metamaskrc` 文件中将所需的特性开关设置为 true。之后，执行 `yarn build:test` 即可生成带有该特性开关的测试构建。

- 或者，也可以在创建测试构建时直接通过命令行参数启用特性开关。例如，启用 MULTICHAIN 特性开关可以运行 `MULTICHAIN=1 yarn build:test` 或 `MULTICHAIN=1 yarn start:test`。这种方式可以快速调整特性开关，无需修改 `.metamaskrc` 文件。

当你生成了带有目标特性开关的测试构建后，像平常一样运行测试即可。此时你的测试会基于已启用该特性开关的扩展版本。例如：
`yarn test:e2e:single test/e2e/tests/account-menu/account-details.spec.js --browser=chrome`

这种方式可以确保你的 e2e 测试准确反映即将 GA 的新功能的用户体验。

#### 针对不同构建类型运行 e2e 测试

不同的构建类型有各自对应的 e2e 测试集。要运行这些测试，请在 `package.json` 文件中查找相关命令。例如：

```console
    "test:e2e:chrome:snaps": "SELENIUM_BROWSER=chrome node test/e2e/run-all.js --snaps",
    "test:e2e:firefox": "SELENIUM_BROWSER=firefox node test/e2e/run-all.js",
```

### 依赖变更

每当你更改依赖（无论是添加、删除还是更新 `package.json` 或 `yarn.lock`），都需要同步维护多个文件：

- `yarn.lock`：
  - 依赖变更后再次运行 `yarn`，确保 `yarn.lock` 已正确更新。
  - 运行 `yarn lint:lockfile:dedupe:fix`，去除 lockfile 中的重复依赖。
- `package.json` 中的 `allow-scripts` 配置
  - 运行 `yarn allow-scripts auto` 自动更新 `allow-scripts` 配置。该配置决定哪些包的 install/postinstall 脚本被允许执行。每次引入新包时请检查是否需要运行 install 脚本，并视情况测试。
  - 注意：`yarn allow-scripts auto` 在不同平台上表现不一致。macOS 和 Windows 用户可能会看到与可选依赖相关的多余变更。
- LavaMoat 策略文件
  - 如果你是 MetaMask 团队成员且 PR 在仓库分支上，可以用机器人命令 `@metamaskbot update-policies` 让 MetaMask 机器人自动更新策略文件。
  - 如果你的 PR 来自 fork，可以请团队成员协助更新策略文件。
  - 手动更新方法：简而言之，运行 `yarn lavamoat:auto` 更新这些文件，但细节上需注意：
    - LavaMoat 策略文件分为两套：
      - 生产环境策略文件（`lavamoat/browserify/*/policy.json`），通过 `yarn lavamoat:webapp:auto` 重新生成。可加 `--help` 查看用法。
        - 每当 webapp 的生产依赖变更时都应重新生成。
      - 构建系统策略文件（`lavamoat/build-system/policy.json`），通过 `yarn lavamoat:build:auto` 重新生成。
        - 每当构建系统自身依赖变更时都应重新生成。
    - 每次重新生成策略文件后，请检查变更，确保每个包的访问权限合理。
    - 注意：`yarn lavamoat:auto` 在不同平台上表现不一致。macOS 和 Windows 用户可能会看到与可选依赖相关的多余变更。
    - 如果多次重新生成策略文件后仍遇到策略失败，建议先清理依赖再重试：
      - `rm -rf node_modules/ && yarn && yarn lavamoat:auto`
    - 注意，任何动态 import 或全局变量的动态用法都可能绕过 LavaMoat 的静态分析。遇到问题请查阅 LavaMoat 文档或寻求帮助。
- 归属文件（Attributions file）
  - 如果你是 MetaMask 团队成员且 PR 在仓库分支上，可以用机器人命令 `@metamaskbot update-attributions` 让 MetaMask 机器人自动更新归属文件。
  - 手动更新：运行 `yarn attributions:generate`。

## 架构

- [2022 年夏季控制器层级与依赖关系可视化](https://gist.github.com/rekmarks/8dba6306695dcd44967cce4b6a94ae33)
- [整个代码库的可视化](https://mango-dune-07a8b7110.1.azurestaticapps.net/?repo=metamask%2Fmetamask-extension)

[![架构图](./docs/architecture.png)][1]

## 其他文档

- [如何为 MetaMask 添加新翻译](./docs/translating-guide.md)
- [发布指南](./docs/publishing.md)
- [如何使用 TREZOR 模拟器](./docs/trezor-emulator.md)
- [MetaMask 开发文档](./development/README.md)
- [如何生成本仓库开发过程的可视化图](./development/gource-viz.sh)
- [如何添加新确认](./docs/confirmations.md)
- [浏览器支持指南](./docs/browser-support.md)

## Dapp 开发者资源

- [用 MetaMask Snaps 扩展 MetaMask 功能](https://docs.metamask.io/snaps/)
- [提示用户添加并切换到新网络](https://docs.metamask.io/wallet/how-to/add-network/)
- [更改你的 dapp 连接 MetaMask 时显示的图标](https://docs.metamask.io/wallet/how-to/display/icon/)

[1]: http://www.nomnoml.com/#view/%5B%3Cactor%3Euser%5D%0A%0A%5Bmetamask-ui%7C%0A%20%20%20%5Btools%7C%0A%20%20%20%20%20react%0A%20%20%20%20%20redux%0A%20%20%20%20%20thunk%0A%20%20%20%20%20ethUtils%0A%20%20%20%20%20jazzicon%0A%20%20%20%5D%0A%20%20%20%5Bcomponents%7C%0A%20%20%20%20%20app%0A%20%20%20%20%20account-detail%0A%20%20%20%20%20accounts%0A%20%20%20%20%20locked-screen%0A%20%20%20%20%20restore-vault%0A%20%20%20%20%20identicon%0A%20%20%20%20%20config%0A%20%20%20%20%20info%0A%20%20%20%5D%0A%20%20%20%5Breducers%7C%0A%20%20%20%20%20app%0A%20%20%20%20%20metamask%0A%20%20%20%20%20identities%0A%20%20%20%5D%0A%20%20%20%5Bactions%7C%0A%20%20%20%20%20%5BbackgroundConnection%5D%0A%20%20%20%5D%0A%20%20%20%5Bcomponents%5D%3A-%3E%5Bactions%5D%0A%20%20%20%5Bactions%5D%3A-%3E%5Breducers%5D%0A%20%20%20%5Breducers%5D%3A-%3E%5Bcomponents%5D%0A%5D%0A%0A%5Bweb%20dapp%7C%0A%20%20%5Bui%20code%5D%0A%20%20%5Bweb3%5D%0A%20%20%5Bmetamask-inpage%5D%0A%20%20%0A%20%20%5B%3Cactor%3Eui%20developer%5D%0A%20%20%5Bui%20developer%5D-%3E%5Bui%20code%5D%0A%20%20%5Bui%20code%5D%3C-%3E%5Bweb3%5D%0A%20%20%5Bweb3%5D%3C-%3E%5Bmetamask-inpage%5D%0A%5D%0A%0A%5Bmetamask-background%7C%0A%20%20%5Bprovider-engine%5D%0A%20%20%5Bhooked%20wallet%20subprovider%5D%0A%20%20%5Bid%20store%5D%0A%20%20%0A%20%20%5Bprovider-engine%5D%3C-%3E%5Bhooked%20wallet%20subprovider%5D%0A%20%20%5Bhooked%20wallet%20subprovider%5D%3C-%3E%5Bid%20store%5D%0A%20%20%5Bconfig%20manager%7C%0A%20%20%20%20%5Brpc%20configuration%5D%0A%20%20%20%20%5Bencrypted%20keys%5D%0A%20%20%20%20%5Bwallet%20nicknames%5D%0A%20%20%5D%0A%20%20%0A%20%20%5Bprovider-engine%5D%3C-%5Bconfig%20manager%5D%0A%20%20%5Bid%20store%5D%3C-%3E%5Bconfig%20manager%5D%0A%5D%0A%0A%5Buser%5D%3C-%3E%5Bmetamask-ui%5D%0A%0A%5Buser%5D%3C%3A--%3A%3E%5Bweb%20dapp%5D%0A%0A%5Bmetamask-contentscript%7C%0A%20%20%5Bplugin%20restart%20detector%5D%0A%20%20%5Brpc%20passthrough%5D%0A%5D%0A%0A%5Brpc%20%7C%0A%20%20%5Bethereum%20blockchain%20%7C%0A%20%20%20%20%5Bcontracts%5D%0A%20%20%20%20%5Baccounts%5D%0A%20%20%5D%0A%5D%0A%0A%5Bweb%20dapp%5D%3C%3A--%3A%3E%5Bmetamask-contentscript%5D%0A%5Bmetamask-contentscript%5D%3C-%3E%5Bmetamask-background%5D%0A%5Bmetamask-background%5D%3C-%3E%5Bmetamask-ui%5D%0A%5Bmetamask-background%5D%3C-%3E%5Brpc%5D%0A
