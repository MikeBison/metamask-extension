#!/usr/bin/env node
//
// 构建任务定义
//
// 使用 "yarn build ${taskName}" 运行任何任务
//
const path = require('path');
const livereload = require('gulp-livereload');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { sync: globby } = require('globby');
const lavapack = require('@lavamoat/lavapack');
const difference = require('lodash/difference');
const { intersection } = require('lodash');
const { getVersion } = require('../lib/get-version');
const { loadBuildTypesConfig } = require('../lib/build-type');
const { BUILD_TARGETS, TASKS } = require('./constants');
const {
  createTask,
  composeSeries,
  composeParallel,
  runTask,
} = require('./task');
const createManifestTasks = require('./manifest');
const createScriptTasks = require('./scripts');
const createStyleTasks = require('./styles');
const createStaticAssetTasks = require('./static');
const createEtcTasks = require('./etc');
const {
  getBrowserVersionMap,
  getEnvironment,
  isDevBuild,
  isTestBuild,
} = require('./utils');
const { getConfig } = require('./config');

/* eslint-disable no-constant-condition, node/global-require */
if (false) {
  // 通过 browserify/eslint 配置在依赖项中动态引入的包。
  // 这是 LavaMoat 静态分析器用于策略生成的一个变通方法。
  // 为了避免需要为这些包编写策略覆盖，我们可以将它们放在这里，
  // 它们将被包含在策略中。很巧妙！
  require('loose-envify');
  require('@babel/preset-env');
  require('@babel/preset-react');
  require('@babel/preset-typescript');
  require('@babel/core');
  // ESLint 相关
  require('@babel/eslint-parser');
  require('@babel/eslint-plugin');
  require('@metamask/eslint-config');
  require('@metamask/eslint-config-nodejs');
  // eslint-disable-next-line import/no-unresolved
  require('@typescript-eslint/parser');
  require('eslint');
  require('eslint-config-prettier');
  require('eslint-import-resolver-node');
  require('eslint-import-resolver-typescript');
  require('eslint-plugin-import');
  require('eslint-plugin-jsdoc');
  require('eslint-plugin-node');
  require('eslint-plugin-prettier');
  require('eslint-plugin-react');
  require('eslint-plugin-react-hooks');
  require('eslint-plugin-jest');
}
/* eslint-enable no-constant-condition, node/global-require */

// 定义并运行构建任务，如果出错则设置退出码为1
defineAndRunBuildTasks().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

// 主要函数：定义并运行构建任务
async function defineAndRunBuildTasks() {
  // 解析命令行参数
  const {
    applyLavaMoat, // 是否应用LavaMoat安全框架
    buildType, // 构建类型（main, beta, flask等）
    entryTask, // 入口任务（dev, dist, prod, test等）
    isLavaMoat, // 是否使用LavaMoat运行
    policyOnly, // 是否仅生成LavaMoat策略
    shouldIncludeLockdown, // 是否包含SES lockdown文件
    shouldIncludeSnow, // 是否包含Snow文件
    shouldLintFenceFiles, // 是否应该检查代码围栏文件
    skipStats, // 是否跳过统计信息
    version, // 版本号
    platform, // 平台（chrome, firefox）
  } = await parseArgv();

  console.log(
    '构建参数 ---------------',
    `applyLavaMoat: ${applyLavaMoat}, buildType: ${buildType}, entryTask: ${entryTask}, isLavaMoat: ${isLavaMoat}, policyOnly: ${policyOnly}, shouldIncludeLockdown: ${shouldIncludeLockdown}, shouldIncludeSnow: ${shouldIncludeSnow}, shouldLintFenceFiles: ${shouldLintFenceFiles}, skipStats: ${skipStats}, version: ${version}, platform: ${platform}`,
  );

  // 检查是否为根任务（主要构建目标之一）
  const isRootTask = Object.values(BUILD_TARGETS).includes(entryTask);

  if (isRootTask) {
    // 仅在生产/测试环境中使用scuttle
    const shouldScuttle = entryTask !== BUILD_TARGETS.DEV;

    // 定义scuttle全局this例外列表
    let scuttleGlobalThisExceptions = [
      // 在lm compartment外部被不同mm依赖使用的全局变量
      'Proxy',
      'toString',
      'getComputedStyle',
      'addEventListener',
      'removeEventListener',
      'ShadowRoot',
      'HTMLElement',
      'HTMLFormElement',
      'Element',
      'pageXOffset',
      'pageYOffset',
      'visualViewport',
      'Reflect',
      'Set',
      'Object',
      'navigator',
      'harden',
      'console',
      'WeakSet',
      'Event',
      'Image', // 浏览器用于生成通知
      'fetch', // 浏览器用于生成通知
      'OffscreenCanvas', // 浏览器用于生成通知
      // chromedriver需要的全局变量
      /cdc_[a-zA-Z0-9]+_[a-zA-Z]+/iu,
      'name',
      'performance',
      'parseFloat',
      'innerWidth',
      'innerHeight',
      'Symbol',
      'Math',
      'DOMRect',
      'Number',
      'Array',
      'crypto',
      'Function',
      'Uint8Array',
      'String',
      'Promise',
      'JSON',
      'Date',
      // sentry需要的全局变量
      '__SENTRY__',
      'appState',
      'extra',
      'stateHooks',
      'sentryHooks',
      'sentry',
    ];

    // 为测试构建添加额外的例外
    if (
      entryTask === BUILD_TARGETS.TEST ||
      entryTask === BUILD_TARGETS.TEST_DEV
    ) {
      scuttleGlobalThisExceptions = [
        ...scuttleGlobalThisExceptions,
        // chromedriver需要的更多全局变量
        // 将来，上面的更多全局变量可以放入此列表
        'Proxy',
        'ret_nodes',
      ];
    }

    console.log(
      `构建lavamoat运行时文件`,
      `(scuttling ${shouldScuttle ? '开启' : '关闭'})`,
    );

    // 构建lavamoat运行时文件
    await lavapack.buildRuntime({
      scuttleGlobalThis: {
        enabled: applyLavaMoat && shouldScuttle,
        scuttlerName: 'SCUTTLER',
        exceptions: scuttleGlobalThisExceptions,
      },
    });
  }

  // 确定目标浏览器平台
  const browserPlatforms = platform ? [platform] : ['firefox', 'chrome'];

  // 获取浏览器版本映射
  const browserVersionMap = getBrowserVersionMap(browserPlatforms, version);

  // 获取当前构建类型需要忽略的文件
  const ignoredFiles = getIgnoredFiles(buildType);

  // 创建静态资源任务
  const staticTasks = createStaticAssetTasks({
    livereload,
    browserPlatforms,
    shouldIncludeLockdown,
    shouldIncludeSnow,
    buildType,
  });

  // 创建manifest任务
  const manifestTasks = createManifestTasks({
    browserPlatforms,
    browserVersionMap,
    buildType,
    applyLavaMoat,
    shouldIncludeSnow,
    entryTask,
  });

  // 创建样式任务
  const styleTasks = createStyleTasks({ livereload });

  // 创建脚本任务
  const scriptTasks = createScriptTasks({
    shouldIncludeSnow,
    applyLavaMoat,
    browserPlatforms,
    buildType,
    ignoredFiles,
    isLavaMoat,
    livereload,
    policyOnly,
    shouldLintFenceFiles,
    version,
  });

  // 创建其他任务（清理、重载、打包）
  const { clean, reload, zip } = createEtcTasks({
    livereload,
    browserPlatforms,
    buildType,
    version,
  });

  // 创建开发构建任务（带livereload）
  createTask(
    TASKS.DEV,
    composeSeries(
      clean,
      styleTasks.dev,
      composeParallel(
        scriptTasks.dev,
        staticTasks.dev,
        manifestTasks.dev,
        reload,
      ),
    ),
  );

  // 创建测试开发构建任务（带livereload）
  createTask(
    TASKS.TEST_DEV,
    composeSeries(
      clean,
      styleTasks.dev,
      composeParallel(
        scriptTasks.testDev,
        staticTasks.dev,
        manifestTasks.testDev,
        reload,
      ),
    ),
  );

  // 创建类生产分发构建任务
  createTask(
    TASKS.DIST,
    composeSeries(
      clean,
      styleTasks.prod,
      composeParallel(scriptTasks.dist, staticTasks.prod, manifestTasks.prod),
      zip,
    ),
  );

  // 创建生产发布构建任务
  createTask(
    TASKS.PROD,
    composeSeries(
      clean,
      styleTasks.prod,
      composeParallel(scriptTasks.prod, staticTasks.prod, manifestTasks.prod),
      zip,
    ),
  );

  // 仅构建生产脚本，用于LavaMoat策略生成
  createTask(TASKS.SCRIPTS_DIST, scriptTasks.dist);

  // 创建CI测试构建任务
  createTask(
    TASKS.TEST,
    composeSeries(
      clean,
      styleTasks.prod,
      composeParallel(scriptTasks.test, staticTasks.prod, manifestTasks.test),
      zip,
    ),
  );

  // 创建最小CI测试的特殊构建
  createTask(TASKS.styles, styleTasks.prod);

  // 最后，通过运行入口任务开始构建过程
  await runTask(entryTask, { skipStats });
}

// 解析命令行参数
async function parseArgv() {
  const { argv } = yargs(hideBin(process.argv))
    .usage('$0 <task> [options]', '构建MetaMask扩展。', (_yargs) =>
      _yargs
        .positional('task', {
          description: `要运行的任务。有许多主要任务，每个任务内部调用其他任务。主要任务包括：

dev: 创建未优化的、实时重载的本地开发构建。

dist: 为非生产环境创建类似生产的优化构建。

prod: 为生产环境创建优化构建。

test: 为运行e2e测试创建优化构建。

testDev: 为调试e2e测试创建未优化的、实时重载的构建。`,
          type: 'string',
        })
        .option('apply-lavamoat', {
          default: true,
          description:
            '是否使用LavaMoat。在开发过程中，如果你想稍后处理LavaMoat错误，将此设置为`false`可能会有用。',
          type: 'boolean',
        })
        .option('build-type', {
          default: loadBuildTypesConfig().default,
          description: '要创建的构建类型。',
          choices: Object.keys(loadBuildTypesConfig().buildTypes),
        })
        .option('build-version', {
          default: 0,
          description:
            '构建版本。这仅为非主要构建类型设置。构建版本用于扩展版本的"预发布"部分，例如`[major].[minor].[patch]-[build-type].[build-version]`',
          type: 'number',
        })
        .option('lint-fence-files', {
          description:
            '是否应在移除代码围栏后检查包含代码围栏的文件。如果检查失败，构建将失败。如果入口任务是`dev`或`testDev`，则默认为`false`。否则默认为`true`。',
          type: 'boolean',
        })
        .option('lockdown', {
          default: true,
          description:
            '是否在扩展包中包含SES lockdown文件。在开发过程中，如果你想稍后处理lockdown错误，将此设置为`false`可能会有用。',
          type: 'boolean',
        })
        .option('snow', {
          default: true,
          description:
            '是否在扩展包中包含Snow文件。在开发过程中，如果你想稍后处理Snow错误，将此设置为`false`可能会有用。',
          type: 'boolean',
        })
        .option('policy-only', {
          default: false,
          description:
            '在生成LavaMoat策略后停止构建，跳过除LavaMoat策略本身之外的任何写入磁盘操作。',
          type: 'boolean',
        })
        .option('skip-stats', {
          default: false,
          description:
            '是否跳过将每个任务的完成时间记录到控制台。这主要用于内部使用，以防止重复记录。',
          hidden: true,
          type: 'boolean',
        })
        .option('platform', {
          default: '',
          description: '指定要构建的单一浏览器平台。可以是`chrome`或`firefox`',
          hidden: true,
          type: 'string',
        })
        .check((args) => {
          if (!Number.isInteger(args.buildVersion)) {
            throw new Error(
              `'build-version'需要整数，得到'${args.buildVersion}'`,
            );
          } else if (!Object.values(TASKS).includes(args.task)) {
            throw new Error(`无效任务: '${args.task}'`);
          }
          return true;
        }),
    )
    // TODO: 在此问题解决后启用`.strict()`：https://github.com/LavaMoat/LavaMoat/issues/344
    .help('help');

  const {
    applyLavamoat: applyLavaMoat,
    buildType,
    buildVersion,
    lintFenceFiles,
    lockdown,
    snow,
    policyOnly,
    skipStats,
    task,
    platform,
  } = argv;

  // 手动为dev和test构建默认为`false`
  const shouldLintFenceFiles =
    lintFenceFiles ?? (!isDevBuild(task) && !isTestBuild(task));

  // 获取版本号
  const version = getVersion(buildType, buildVersion);

  // 检查高级任务并验证配置
  const highLevelTasks = Object.values(BUILD_TARGETS);
  if (highLevelTasks.includes(task)) {
    const environment = getEnvironment({ buildTarget: task });
    // 输出被忽略，这只是为了确保配置被验证
    await getConfig(buildType, environment);
  }

  return {
    applyLavaMoat,
    buildType,
    entryTask: task,
    isLavaMoat: process.argv[0].includes('lavamoat'),
    policyOnly,
    shouldIncludeLockdown: lockdown,
    shouldIncludeSnow: snow,
    shouldLintFenceFiles,
    skipStats,
    version,
    platform,
  };
}

/**
 * 获取当前构建需要忽略的文件（如果有）。
 *
 * @param {string} currentBuildType - 当前构建的类型。
 * @returns {string[] | null} 当前构建需要忽略的文件数组，如果没有文件需要忽略则返回`null`。
 */
function getIgnoredFiles(currentBuildType) {
  // 加载构建类型配置
  const buildConfig = loadBuildTypesConfig();
  const cwd = process.cwd();

  // 获取特定功能的独占资源
  const exclusiveAssetsForFeatures = (features) =>
    globby(
      features
        .flatMap(
          (feature) =>
            buildConfig.features[feature].assets
              ?.filter((asset) => 'exclusiveInclude' in asset)
              .map((asset) => asset.exclusiveInclude) ?? [],
        )
        .map((pathGlob) => path.resolve(cwd, pathGlob)),
    );

  // 获取所有功能和当前构建类型的活动功能
  const allFeatures = Object.keys(buildConfig.features);
  const activeFeatures =
    buildConfig.buildTypes[currentBuildType].features ?? [];
  // 计算非活动功能（所有功能减去活动功能）
  const inactiveFeatures = difference(allFeatures, activeFeatures);

  // 获取需要忽略的路径（非活动功能的独占资源）
  const ignoredPaths = exclusiveAssetsForFeatures(inactiveFeatures);

  // 进行健全性检查，验证非活动功能没有排除活动功能尝试包含的文件
  const activePaths = exclusiveAssetsForFeatures(activeFeatures);
  const conflicts = intersection(activePaths, ignoredPaths);
  if (conflicts.length !== 0) {
    throw new Error(`以下路径同时被活动和非活动功能独占要求，导致冲突：
\t-> ${conflicts.join('\n\t-> ')}
请修复builds.yml`);
  }

  return ignoredPaths;
}
