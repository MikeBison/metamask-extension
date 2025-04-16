/**
 * 构建目标。这描述了构建的总体目的。
 *
 * 这些常量同时也作为构建系统的高级任务（即通常通过CLI直接调用的任务，而不是内部调用的任务）。
 */
const BUILD_TARGETS = {
  DEV: 'dev', // 开发环境构建
  DIST: 'dist', // 分发版本构建
  PROD: 'prod', // 生产环境构建
  TEST: 'test', // 测试环境构建
  TEST_DEV: 'testDev', // 测试开发环境构建
};

/**
 * 构建环境。这描述了生成此构建的环境。
 */
const ENVIRONMENT = {
  DEVELOPMENT: 'development', // 开发环境
  PRODUCTION: 'production', // 生产环境
  OTHER: 'other', // 其他环境
  PULL_REQUEST: 'pull-request', // PR环境
  RELEASE_CANDIDATE: 'release-candidate', // 发布候选环境
  STAGING: 'staging', // 预发布环境
  TESTING: 'testing', // 测试环境
};

// 任务列表，包含所有可执行的构建任务
const TASKS = {
  ...BUILD_TARGETS, // 包含所有构建目标作为任务
  CLEAN: 'clean', // 清理任务
  LINT_SCSS: 'lint-scss', // SCSS代码检查
  MANIFEST_DEV: 'manifest:dev', // 开发环境的manifest生成
  MANIFEST_PROD: 'manifest:prod', // 生产环境的manifest生成
  MANIFEST_TEST: 'manifest:test', // 测试环境的manifest生成
  MANIFEST_TEST_DEV: 'manifest:testDev', // 测试开发环境的manifest生成
  RELOAD: 'reload', // 重新加载任务
  // 以下是各种脚本构建任务，按环境和功能分类
  SCRIPTS_CORE_DEV_STANDARD_ENTRY_POINTS:
    'scripts:core:dev:standardEntryPoints', // 开发环境标准入口点脚本
  SCRIPTS_CORE_DEV_CONTENTSCRIPT: 'scripts:core:dev:contentscript', // 开发环境内容脚本
  SCRIPTS_CORE_DEV_DISABLE_CONSOLE: 'scripts:core:dev:disable-console', // 开发环境禁用控制台脚本
  SCRIPTS_CORE_DEV_SENTRY: 'scripts:core:dev:sentry', // 开发环境Sentry错误跟踪脚本
  SCRIPTS_CORE_DEV_PHISHING_DETECT: 'scripts:core:dev:phishing-detect', // 开发环境钓鱼检测脚本
  SCRIPTS_CORE_DIST_STANDARD_ENTRY_POINTS:
    'scripts:core:dist:standardEntryPoints', // 分发版本标准入口点脚本
  SCRIPTS_CORE_DIST_CONTENTSCRIPT: 'scripts:core:dist:contentscript', // 分发版本内容脚本
  SCRIPTS_CORE_DIST_DISABLE_CONSOLE: 'scripts:core:dist:disable-console', // 分发版本禁用控制台脚本
  SCRIPTS_CORE_DIST_SENTRY: 'scripts:core:dist:sentry', // 分发版本Sentry错误跟踪脚本
  SCRIPTS_CORE_DIST_PHISHING_DETECT: 'scripts:core:dist:phishing-detect', // 分发版本钓鱼检测脚本
  SCRIPTS_CORE_PROD_STANDARD_ENTRY_POINTS:
    'scripts:core:prod:standardEntryPoints', // 生产环境标准入口点脚本
  SCRIPTS_CORE_PROD_CONTENTSCRIPT: 'scripts:core:prod:contentscript', // 生产环境内容脚本
  SCRIPTS_CORE_PROD_DISABLE_CONSOLE: 'scripts:core:prod:disable-console', // 生产环境禁用控制台脚本
  SCRIPTS_CORE_PROD_SENTRY: 'scripts:core:prod:sentry', // 生产环境Sentry错误跟踪脚本
  SCRIPTS_CORE_PROD_PHISHING_DETECT: 'scripts:core:prod:phishing-detect', // 生产环境钓鱼检测脚本
  SCRIPTS_CORE_TEST_LIVE_STANDARD_ENTRY_POINTS:
    'scripts:core:test-live:standardEntryPoints', // 实时测试环境标准入口点脚本
  SCRIPTS_CORE_TEST_LIVE_CONTENTSCRIPT: 'scripts:core:test-live:contentscript', // 实时测试环境内容脚本
  SCRIPTS_CORE_TEST_LIVE_DISABLE_CONSOLE:
    'scripts:core:test-live:disable-console', // 实时测试环境禁用控制台脚本
  SCRIPTS_CORE_TEST_LIVE_SENTRY: 'scripts:core:test-live:sentry', // 实时测试环境Sentry错误跟踪脚本
  SCRIPTS_CORE_TEST_LIVE_PHISHING_DETECT:
    'scripts:core:test-live:phishing-detect', // 实时测试环境钓鱼检测脚本
  SCRIPTS_CORE_TEST_STANDARD_ENTRY_POINTS:
    'scripts:core:test:standardEntryPoints', // 测试环境标准入口点脚本
  SCRIPTS_CORE_TEST_CONTENTSCRIPT: 'scripts:core:test:contentscript', // 测试环境内容脚本
  SCRIPTS_CORE_TEST_DISABLE_CONSOLE: 'scripts:core:test:disable-console', // 测试环境禁用控制台脚本
  SCRIPTS_CORE_TEST_SENTRY: 'scripts:core:test:sentry', // 测试环境Sentry错误跟踪脚本
  SCRIPTS_CORE_TEST_PHISHING_DETECT: 'scripts:core:test:phishing-detect', // 测试环境钓鱼检测脚本
  SCRIPTS_DIST: 'scripts:dist', // 分发版本脚本总任务
  STATIC_DEV: 'static:dev', // 开发环境静态资源
  STATIC_PROD: 'static:prod', // 生产环境静态资源
  STYLES: 'styles', // 样式总任务
  STYLES_DEV: 'styles:dev', // 开发环境样式
  STYLES_PROD: 'styles:prod', // 生产环境样式
  ZIP: 'zip', // 打包为zip文件任务
};

// 导出所有常量供其他模块使用
module.exports = { BUILD_TARGETS, ENVIRONMENT, TASKS };
