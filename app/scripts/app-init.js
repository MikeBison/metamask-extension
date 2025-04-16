// 翻译：此文件仅用于 manifest 版本 3
// 辅助阅读：明确指出该文件的适用范围，仅适用于 manifest 版本 3 的相关项目，说明其功能和使用场景与特定的 manifest 版本相关联。

// 翻译：表示 importAllScripts 是否已经运行
// 辅助阅读：该注释解释了变量 `scriptsLoadInitiated` 的作用，用于标记 `importAllScripts` 函数是否已经执行过，以便在后续逻辑中进行判断和处理。
// eslint-disable-next-line
let scriptsLoadInitiated = false;
// 从全局对象 globalThis 中获取 chrome 对象
// 辅助阅读：`chrome` 对象通常在 Chrome 扩展开发中用于与浏览器的各种功能进行交互，这里获取它以便后续使用相关的 API。
const { chrome } = globalThis;
// 获取环境变量 IN_TEST 的值，用于判断是否处于测试模式
// 辅助阅读：`process.env.IN_TEST` 用于获取环境变量的值，根据这个值可以决定代码在不同模式下的行为，比如是否单独导入文件以捕获加载时间统计等。
const testMode = process.env.IN_TEST;
// 在控制台输出测试模式的值
// 辅助阅读：将 `testMode` 的值输出到控制台，方便开发者在调试时查看当前是否处于测试模式。
console.log('testMode - app-init.js:', testMode);

/**
 * @type {globalThis.stateHooks}
 * 翻译：全局状态钩子，用于在不同脚本间共享状态
 * 辅助阅读：`stateHooks` 是一个全局对象，其作用是在不同的脚本之间共享状态信息，使得各个脚本可以获取和修改这些共享状态，增强代码之间的交互和协作。
 */
globalThis.stateHooks = globalThis.stateHooks || {};

// 用于记录脚本加载时间的数组
// 辅助阅读：`loadTimeLogs` 数组用于存储每个脚本的加载时间相关信息，包括脚本名称、加载耗时、开始时间、结束时间等，方便后续进行性能分析。
const loadTimeLogs = [];
// eslint-disable-next-line import/unambiguous
// 尝试导入指定的脚本文件
// 辅助阅读：`tryImport` 函数接受一个或多个文件名作为参数，尝试导入这些脚本文件，并记录加载时间等信息。如果导入成功返回 true，失败则返回 false 并在控制台输出错误信息。
function tryImport(...fileNames) {
  try {
    // 记录开始导入的时间
    // 辅助阅读：获取当前时间作为导入脚本的开始时间，用于计算后续的加载耗时。
    const startTime = new Date().getTime();
    // 导入指定的脚本文件
    // 辅助阅读：使用 `importScripts` 方法导入给定的脚本文件，这是在 Service Worker 等环境中用于加载脚本的方式。
    // eslint-disable-next-line
    importScripts(...fileNames);
    // 记录导入结束的时间
    // 辅助阅读：获取当前时间作为导入脚本的结束时间，用于计算加载耗时。
    const endTime = new Date().getTime();
    // 将脚本的加载时间等信息添加到 loadTimeLogs 数组中
    // 辅助阅读：将脚本的名称、加载耗时、开始时间、结束时间等信息以对象的形式添加到 `loadTimeLogs` 数组中，方便后续进行性能分析和记录。
    loadTimeLogs.push({
      name: fileNames[0],
      value: endTime - startTime,
      children: [],
      startTime,
      endTime,
    });

    return true;
  } catch (e) {
    // 如果导入过程中出现错误，在控制台输出错误信息
    // 辅助阅读：当导入脚本出现异常时，将错误信息输出到控制台，方便开发者排查问题。
    console.error(e);
  }

  return false;
}

// 导入所有脚本的函数
// 辅助阅读：`importAllScripts` 函数的主要功能是根据不同的条件（如是否处于测试模式、环境变量的值等）来导入一系列的脚本文件，并记录相关的加载时间等信息。
function importAllScripts() {
  // 如果已经导入了脚本，则退出函数
  // 辅助阅读：通过检查 `scriptsLoadInitiated` 变量的值来判断是否已经执行过导入脚本的操作，如果是则直接返回，避免重复导入。
  if (scriptsLoadInitiated) {
    return;
  }
  // 将 scriptsLoadInitiated 标记为已导入
  // 辅助阅读：将 `scriptsLoadInitiated` 设置为 true，表明已经开始执行导入脚本的操作。
  scriptsLoadInitiated = true;
  const files = [];

  // 在测试模式下单独导入文件，这有助于捕获加载时间统计
  // 辅助阅读：`loadFile` 函数用于根据是否处于测试模式来决定是直接尝试导入文件还是将文件名添加到 `files` 数组中，以便后续统一导入。
  const loadFile = (fileName) => {
    if (testMode) {
      tryImport(fileName);
    } else {
      files.push(fileName);
    }
  };

  // 记录开始导入脚本的时间
  // 辅助阅读：获取当前时间作为开始导入所有脚本的时间点，用于计算整个导入过程的耗时。
  const startImportScriptsTime = Date.now();

  // useSnow 的值在构建时被动态替换为实际值
  // 辅助阅读：`useSnow` 是一个环境变量，其值在构建过程中会被动态设置，这里获取它的值并根据其值来决定后续的操作，比如是否导入与 `Snow` 相关的脚本。
  const useSnow = process.env.USE_SNOW;
  // 在控制台输出 useSnow 的值
  // 辅助阅读：将 `useSnow` 的值输出到控制台，方便开发者在调试时查看该环境变量的值。
  console.log('useSnow - app-init.js:', useSnow);

  // 如果 useSnow 不是布尔类型，则抛出错误
  // 辅助阅读：对 `useSnow` 的类型进行检查，确保其为布尔类型，否则抛出错误提示缺少必要的环境变量。
  if (typeof useSnow !== 'boolean') {
    throw new Error('缺少 USE_SNOW 环境变量');
  }

  // applyLavaMoat 的值在构建时被动态替换为实际值
  // 辅助阅读：`applyLavaMoat` 是一个环境变量，其值在构建过程中会被动态设置，这里获取它的值并根据其值来决定是否导入与 LavaMoat 相关的脚本。
  const applyLavaMoat = process.env.APPLY_LAVAMOAT;
  // 在控制台输出 applyLavaMoat 的值
  // 辅助阅读：将 `applyLavaMoat` 的值输出到控制台，方便开发者在调试时查看该环境变量的值。
  console.log('applyLavaMoat - app-init.js:', applyLavaMoat);

  // 如果 applyLavaMoat 不是布尔类型，则抛出错误
  // 辅助阅读：对 `applyLavaMoat` 的类型进行检查，确保其为布尔类型，否则抛出错误提示缺少必要的环境变量。
  if (typeof applyLavaMoat !== 'boolean') {
    throw new Error('缺少 APPLY_LAVAMOAT 环境变量');
  }

  // 加载 Sentry 错误跟踪脚本
  // 辅助阅读：调用 `loadFile` 函数加载 `../scripts/sentry-install.js` 脚本，用于设置 Sentry 错误跟踪功能，以便在运行时捕获和报告错误。
  loadFile('../scripts/sentry-install.js');

  // 如果 useSnow 为 true
  // 辅助阅读：根据 `useSnow` 的值决定是否执行与 `Snow` 相关的脚本导入操作。
  if (useSnow) {
    // 检查是否在 Worker 环境中
    // 辅助阅读：通过检查 `self.document` 是否存在来判断当前是否处于 Worker 环境，这会影响后续是否导入 `snow.js` 脚本。
    // eslint-disable-next-line no-undef
    const isWorker = !self.document;
    if (!isWorker) {
      // 加载 snow.js 脚本
      // 辅助阅读：如果不在 Worker 环境中，则加载 `../scripts/snow.js` 脚本。
      loadFile('../scripts/snow.js');
    }

    // 加载 use-snow.js 脚本
    // 辅助阅读：加载 `../scripts/use-snow.js` 脚本，可能是用于初始化或配置与 `Snow` 相关的功能。
    loadFile('../scripts/use-snow.js');
  }

  // 在 e2e 测试构建中始终应用 LavaMoat，以便捕获初始化统计信息
  // 辅助阅读：根据是否处于测试模式或 `applyLavaMoat` 的值来决定是否导入与 LavaMoat 相关的脚本，以实现安全运行时和相关配置的加载。
  if (testMode || applyLavaMoat) {
    // 加载 LavaMoat 安全运行时脚本
    // 辅助阅读：加载 `../scripts/runtime-lavamoat.js` 脚本，用于设置 LavaMoat 安全运行时环境。
    loadFile('../scripts/runtime-lavamoat.js');
    // 加载额外的 lockdown 配置脚本
    // 辅助阅读：加载 `../scripts/lockdown-more.js` 脚本，可能是用于进一步配置或扩展 SES lockdown 的功能。
    loadFile('../scripts/lockdown-more.js');
    // 加载策略加载脚本
    // 辅助阅读：加载 `../scripts/policy-load.js` 脚本，可能是用于加载和应用相关的安全策略。
    loadFile('../scripts/policy-load.js');
  } else {
    // 初始化全局变量脚本
    // 辅助阅读：加载 `../scripts/init-globals.js` 脚本，用于初始化一些全局变量，为后续代码的运行提供基础环境。
    loadFile('../scripts/init-globals.js');
    // 安装 SES lockdown 脚本
    // 辅助阅读：加载 `../scripts/lockdown-install.js` 脚本，用于安装 SES lockdown，增强代码运行环境的安全性。
    loadFile('../scripts/lockdown-install.js');
    // 运行 lockdown 脚本
    // 辅助阅读：加载 `../scripts/lockdown-run.js` 脚本，用于执行 SES lockdown 的相关操作，进一步限制代码的行为。
    loadFile('../scripts/lockdown-run.js');
    // 额外的 lockdown 配置脚本
    // 辅助阅读：再次加载 `../scripts/lockdown-more.js` 脚本，用于补充或修改 SES lockdown 的配置。
    loadFile('../scripts/lockdown-more.js');
    // CommonJS 运行时脚本
    // 辅助阅读：加载 `../scripts/runtime-cjs.js` 脚本，用于提供 CommonJS 运行时环境，以便在代码中使用 CommonJS 模块规范。
    loadFile('../scripts/runtime-cjs.js');
  }

  // 此环境变量设置为以逗号分隔的相对文件路径字符串
  // 辅助阅读：`rawFileList` 是一个环境变量，其值是一个以逗号分隔的相对文件路径字符串，用于指定需要导入的额外脚本文件。
  const rawFileList = process.env.FILE_NAMES;
  // 在控制台输出 rawFileList 的值
  // 辅助阅读：将 `rawFileList` 的值输出到控制台，方便开发者查看需要导入的额外脚本文件列表。
  console.log('rawFileList - app-init.js:', rawFileList);

  // 将 rawFileList 按逗号分割成数组
  // 辅助阅读：将 `rawFileList` 字符串按逗号分割成数组，以便遍历每个文件名并进行导入操作。
  const fileList = rawFileList.split(',');
  // 遍历文件列表并调用 loadFile 函数
  // 辅助阅读：对 `fileList` 数组中的每个文件名调用 `loadFile` 函数，根据测试模式决定是直接导入还是添加到 `files` 数组中。
  fileList.forEach((fileName) => loadFile(fileName));

  // 导入所有必需的资源
  // 辅助阅读：调用 `tryImport` 函数，一次性导入 `files` 数组中存储的所有脚本文件。
  tryImport(...files);
  // 在控制台输出所有导入的文件列表
  // 辅助阅读：将所有导入的文件列表输出到控制台，方便开发者查看最终导入了哪些脚本文件。
  console.log('所有导入的文件 - app-init.js:', files); // eslint-disable-lin

  // 记录结束导入脚本的时间
  // 辅助阅读：获取当前时间作为结束导入所有脚本的时间点，用于计算整个导入过程的耗时。
  const endImportScriptsTime = Date.now();

  // 用于性能指标/参考
  // 辅助阅读：计算并在控制台输出脚本导入的总耗时，以秒为单位，方便开发者进行性能分析和评估。
  console.log(
    `脚本导入完成，耗时（秒）: ${(Date.now() - startImportScriptsTime) / 1000}`,
  );

  // 在测试模式下，加载时间日志输出到控制台
  // 辅助阅读：如果处于测试模式，则将记录的每个脚本的加载时间等信息以 JSON 格式输出到控制台，方便开发者进行详细的性能分析。
  if (testMode) {
    console.log(
      `每个导入的时间: ${JSON.stringify(
        {
          name: 'Total',
          children: loadTimeLogs,
          startTime: startImportScriptsTime,
          endTime: endImportScriptsTime,
          value: endImportScriptsTime - startImportScriptsTime,
          version: 1,
        },
        undefined,
        '    ',
      )}`,
    );
  }
}

// 参考: https://stackoverflow.com/questions/66406672/chrome-extension-mv3-modularize-service-worker-js-file
// 在 Service Worker 安装时导入所有脚本
// 辅助阅读：监听 `self`（即 Service Worker）的 `install` 事件，当事件触发时调用 `importAllScripts` 函数，用于在 Service Worker 安装时导入所需的脚本。
// eslint-disable-next-line no-undef
self.addEventListener('install', importAllScripts);

/*
 * 翻译：一个保持活动状态的消息监听器，防止 Service Worker 因不活动而被关闭。
 * UI 在 setInterval 中定期发送消息。
 * 如果 Service Worker 被关闭，Chrome 会在收到新消息时重新启动它，但前提是这里定义了监听器。
 *
 * 下面的 chrome 需要替换为跨浏览器对象，
 * 但在将 webextension-polyfill 导入 service worker 时存在问题。
 * chrome 似乎至少在所有基于 Chromium 的浏览器中都能工作
 *
 * 辅助阅读：该注释详细解释了 `chrome.runtime.onMessage` 监听器的作用，它用于接收来自 UI 的消息，防止 Service Worker 因长时间不活动而被关闭。同时提到了目前使用 `chrome` 对象存在的跨浏览器兼容性问题，以及在基于 Chromium 的浏览器中目前的工作情况。
 */
chrome.runtime.onMessage.addListener(() => {
  // 当收到消息时，导入所有脚本
  // 辅助阅读：当接收到来自 UI 的消息时，调用 `importAllScripts` 函数，重新导入所有脚本，可能是为了确保在消息触发时相关脚本已经正确加载。
  importAllScripts();
  return false;
});

/*
 * 翻译：如果 service worker 停止并重新启动，则不会发生 'install' 事件，
 * 并且 chrome.runtime.onMessage 只会在重新启动 service worker 的消息发生时才会触发。
 * 为确保调用 importAllScripts，我们需要在模块作用域中调用它，如下所示。
 * 为避免在安装前调用 `importAllScripts()`，我们只在 serviceWorker 状态为 'activated' 时调用它。
 * 关于 service worker 状态的更多信息：
 * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker/state
 * 测试还表明，当已安装的 service worker 停止然后重新启动时，状态为 'activated'。
 *
 * 辅助阅读：该注释解释了在 Service Worker 停止并重新启动时的情况，由于不会触发 `install` 事件，所以需要在 Service Worker 状态为 `activated` 时调用 `importAllScripts` 函数，以确保脚本能够正确导入。同时提供了关于 Service Worker 状态的参考文档链接，方便开发者进一步了解相关知识。
 */
// eslint-disable-next-line no-undef
if (self.serviceWorker.state === 'activated') {
  // 如果 Service Worker 状态为 'activated'，导入所有脚本
  // 辅助阅读：当 Service Worker 的状态变为 `activated` 时，调用 `importAllScripts` 函数，确保在这种情况下脚本能够被正确导入。
  importAllScripts();
}

/*
 * 翻译：这个内容脚本是以编程方式注入的，因为
 * MAIN world 注入无法通过 manifest 正常工作
 * https://bugs.chromium.org/p/chromium/issues/detail?id=634381
 *
 * 辅助阅读：该注释解释了为什么要以编程方式注入内容脚本，是因为通过 manifest 进行 MAIN world 注入存在问题，并提供了相关的 Chromium 问题链接，方便开发者了解更多背景信息。
 */
const registerInPageContentScript = async () => {
  try {
    // 注册页内内容脚本
    // 辅助阅读：使用 `chrome.scripting.registerContentScripts` 方法注册一个内容脚本，该脚本将在匹配的网页上运行，并指定了脚本的相关配置，如匹配的网址、要注入的脚本文件、运行时机、运行的世界（MAIN 世界）以及是否在所有框架中运行等。
    await chrome.scripting.registerContentScripts([
      {
        id: 'inpage',
        matches: ['file://*/*', 'http://*/*', 'https://*/*'],
        js: ['scripts/inpage.js'], // 要注入的脚本
        runAt: 'document_start', // 在文档开始时运行
        world: 'MAIN', // 在主世界中运行（可以访问页面的 JavaScript 环境）
        allFrames: true, // 在所有框架中运行
      },
    ]);
  } catch (err) {
    /**
     * 翻译：当 app-init.js 重新加载时会发生错误。尝试避免重复脚本错误：
     * 1. 在 runtime.onInstalled 内注册内容脚本 - 这导致了竞态条件，
     *    提供者可能无法及时加载。
     * 2. 在注册前使用 await chrome.scripting.getRegisteredContentScripts()
     *    检查现有的 inpage 脚本 - 提供者无法及时加载。
     *
     * 辅助阅读：该注释解释了在注册内容脚本时可能出现的错误情况以及之前尝试解决的方法和遇到的问题。由于重新加载 `app-init.js` 可能会导致重复脚本错误，之前尝试在 `runtime.onInstalled` 内注册和检查现有脚本都存在提供者加载不及时的问题，所以目前只是简单地输出警告信息。
     */
    console.warn(`放弃注册 inpage 内容脚本的尝试。${err}`);
  }
};

/**
 * `onInstalled` 事件处理程序。
 *
 * 翻译：在 MV3 构建中，我们必须在 `app-init` 中监听此事件，否则我们发现监听器
 * 永远不会被调用。
 * 对于 MV2 构建，监听器是在 `background.js` 中添加的。
 *
 * 辅助阅读：该注释说明了在 MV3 构建中，`onInstalled` 事件监听器需要在 `app-init` 文件中添加，而在 MV2 构建中是在 `background.js` 中添加。这体现了不同版本构建的差异，开发者需要根据具体的构建版本进行相应的处理。
 *
 * @param {chrome.runtime.InstalledDetails} details - 事件详情。
 */
function onInstalledListener(details) {
  // 在控制台输出 onInstalled 事件的详情
  console.log('onInstalledListener - app-init.js', details);
  // 如果是安装事件
  if (details.reason === 'install') {
    // 如果全局状态钩子中存在 metamaskTriggerOnInstall 函数
    if (globalThis.stateHooks.metamaskTriggerOnInstall) {
      // 调用 metamaskTriggerOnInstall 函数
      globalThis.stateHooks.metamaskTriggerOnInstall();
      // 删除该函数以清理全局命名空间
      delete globalThis.stateHooks.metamaskTriggerOnInstall;
    } else {
      // 标记 Metamask 刚刚被安装
      globalThis.stateHooks.metamaskWasJustInstalled = true;
    }
    // 移除 onInstalled 事件监听器
    chrome.runtime.onInstalled.removeListener(onInstalledListener);
  }
}

// 添加安装监听器
chrome.runtime.onInstalled.addListener(onInstalledListener);

// 注册页内内容脚本
registerInPageContentScript();
