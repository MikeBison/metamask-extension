// 禁用以便首先设置初始状态钩子 [注：确保核心安全钩子优先初始化]
// 此导入设置LavaDome安全运行所需的安全内在函数。 [注：必须在不可信代码前执行以防止被篡改]
import '@lavamoat/lavadome-react';

// 此导入设置Sentry所需的全局函数。 [注：尽早执行以捕获后续初始化错误]
import './lib/setup-initial-state-hooks';
import '../../development/wdyr';

// 仅限开发环境，生产构建会跳过"react-devtools"导入 [注：开发工具增强调试体验]
import 'react-devtools';

import PortStream from 'extension-port-stream';
import browser from 'webextension-polyfill';

import { StreamProvider } from '@metamask/providers';
import { createIdRemapMiddleware } from '@metamask/json-rpc-engine';
import log from 'loglevel';
// TODO: 移除受限导入 [注：临时保留的非安全导入，后续需优化]
// eslint-disable-next-line import/no-restricted-paths
import launchMetaMaskUi, { updateBackgroundConnection } from '../../ui';
import {
  ENVIRONMENT_TYPE_FULLSCREEN,
  ENVIRONMENT_TYPE_POPUP,
  PLATFORM_FIREFOX,
} from '../../shared/constants/app'; // 导入环境类型常量 [注：区分全屏/弹窗等运行环境]
import { isManifestV3 } from '../../shared/modules/mv3.utils'; // 检测浏览器清单版本 [注：区分MV2/MV3不同逻辑]
import { checkForLastErrorAndLog } from '../../shared/modules/browser-runtime.utils'; // 错误处理工具 [注：统一日志记录和错误捕获]
import { SUPPORT_LINK } from '../../shared/lib/ui-utils'; // 支持链接 [注：错误页面显示用户支持链接]
import { getErrorHtml } from '../../shared/lib/error-utils'; // 错误页面生成工具 [注：生成自定义错误页面HTML]
import { endTrace, trace, TraceName } from '../../shared/lib/trace'; // 性能追踪工具 [注：用于分析代码执行性能]
import ExtensionPlatform from './platforms/extension'; // 扩展平台抽象类 [注：封装浏览器差异API]
import { setupMultiplex } from './lib/stream-utils'; // 流多路复用工具 [注：管理多个通信流]
import { getEnvironmentType, getPlatform } from './lib/util'; // 环境检测工具 [注：获取当前运行环境类型和平台]
import metaRPCClientFactory from './lib/metaRPCClientFactory'; // RPC客户端工厂 [注：创建后台通信客户端]

const PHISHING_WARNING_PAGE_TIMEOUT = 1 * 1000; // 1秒 [注：钓鱼警告页加载超时时间]
const PHISHING_WARNING_SW_STORAGE_KEY = 'phishing-warning-sw-registered'; // 存储键 [注：标记钓鱼警告服务 worker 已注册]
const METHOD_START_UI_SYNC = 'startUISync'; // 方法名 [注：UI同步开始的消息方法]

const container = document.getElementById('app-content');

let extensionPort; // 扩展端口 [注：与后台通信的端口实例]
let isUIInitialised = false; // UI初始化状态 [注：标记UI是否已完成初始化]

/**
 * 钓鱼警告页加载超时抛出的错误。 [注：超时处理专用错误类]
 */
class PhishingWarningPageTimeoutError extends Error {
  constructor() {
    super('Timeout failed');
  }
}

start().catch(log.error); // 启动主流程并捕获全局错误 [注：入口函数]

async function start() {
  const startTime = performance.now(); // 记录开始时间 [注：性能追踪]

  const traceContext = trace({
    name: TraceName.UIStartup,
    startTime: performance.timeOrigin,
  }); // 初始化追踪上下文 [注：追踪UI启动性能]

  trace({
    name: TraceName.LoadScripts,
    startTime: performance.timeOrigin,
    parentContext: traceContext,
  }); // 追踪脚本加载阶段 [注：性能分析]

  endTrace({
    name: TraceName.LoadScripts,
    timestamp: performance.timeOrigin + startTime,
  }); // 结束脚本加载追踪 [注：记录加载耗时]

  // 创建全局平台实例
  global.platform = new ExtensionPlatform(); // 初始化平台抽象类 [注：封装浏览器API]

  // 识别窗口类型（弹窗、通知等）
  const windowType = getEnvironmentType(); // 获取运行环境类型 [注：区分弹窗/全屏等模式]

  // 建立与后台的流连接
  extensionPort = browser.runtime.connect({ name: windowType }); // 创建连接端口 [注：指定环境类型名称]

  let connectionStream = new PortStream(extensionPort); // 创建端口流 [注：基于端口的通信流]

  const activeTab = await queryCurrentActiveTab(windowType); // 获取当前活动标签页 [注：用于初始化UI上下文]

  /*
   * 在MV3中空白屏幕问题很常见，这是由于UI在后台准备好发送状态之前就初始化了。
   * 以下代码确保仅在收到"CONNECTION_READY"或"startUISync"消息（后台准备好）后才渲染UI，
   * 并确保流和钓鱼警告页仅在收到"startUISync"消息后加载。
   * 如果UI已渲染，则仅更新流。
   */
  const messageListener = async (message) => {
    const method = message?.data?.method; // 提取消息方法 [注：判断消息类型]

    if (method !== METHOD_START_UI_SYNC) {
      return; // 非同步方法直接跳过 [注：仅处理指定的同步消息]
    }

    endTrace({ name: TraceName.BackgroundConnect }); // 结束后台连接追踪 [注：性能分析]

    if (isManifestV3 && isUIInitialised) {
      // 当前服务 worker 恢复时创建新流，未来版本可能尝试复用旧流
      updateUiStreams(connectionStream); // 更新UI流 [注：MV3特有的流恢复逻辑]
    } else {
      await initializeUiWithTab(
        activeTab,
        connectionStream,
        windowType,
        traceContext,
      ); // 初始化UI并传入标签页信息 [注：核心UI初始化逻辑]
    }

    if (isManifestV3) {
      await loadPhishingWarningPage(); // 加载钓鱼警告页 [注：MV3强制预加载确保离线可用]
    } else {
      extensionPort.onMessage.removeListener(messageListener); // 移除旧监听器 [注：MV2清理资源]
    }
  };

  if (isManifestV3) {
    // resetExtensionStreamAndListeners负责从关闭的流中移除监听器，
    // 并创建新流和附加事件监听器
    const resetExtensionStreamAndListeners = () => {
      extensionPort.onMessage.removeListener(messageListener); // 移除旧消息监听器 [注：防止内存泄漏]
      extensionPort.onDisconnect.removeListener(
        resetExtensionStreamAndListeners,
      ); // 移除断开连接监听器 [注：清理旧连接]

      extensionPort = browser.runtime.connect({ name: windowType }); // 重新创建连接端口 [注：处理MV3连接中断]
      connectionStream = new PortStream(extensionPort); // 重新创建端口流 [注：恢复通信]
      extensionPort.onMessage.addListener(messageListener); // 添加新消息监听器 [注：重新建立监听]
      extensionPort.onDisconnect.addListener(resetExtensionStreamAndListeners); // 添加断开连接监听器 [注：支持重连逻辑]
    };

    extensionPort.onDisconnect.addListener(resetExtensionStreamAndListeners); // 监听连接断开事件 [注：触发重连机制]
  }

  trace({
    name: TraceName.BackgroundConnect,
    parentContext: traceContext,
  }); // 开始后台连接追踪 [注：性能分析]

  extensionPort.onMessage.addListener(messageListener); // 添加消息监听器 [注：监听后台同步消息]
}

/**
 * 临时加载钓鱼警告页以确保服务 worker 已注册，使警告页可离线工作。 [注：核心安全机制]
 */
async function loadPhishingWarningPage() {
  // 检查会话存储中是否已在当前浏览器会话中初始化钓鱼警告服务 worker，若是则不再重复初始化
  const phishingSWMemoryFetch = await browser.storage.session.get(
    PHISHING_WARNING_SW_STORAGE_KEY,
  ); // 获取存储标记 [注：避免重复加载]

  if (phishingSWMemoryFetch[PHISHING_WARNING_SW_STORAGE_KEY]) {
    return; // 已注册则直接返回 [注：优化性能]
  }

  const currentPlatform = getPlatform(); // 获取当前平台 [注：处理浏览器差异]
  let iframe; // 初始化iframe [注：用于加载警告页]

  try {
    const extensionStartupPhishingPageUrl = new URL(
      process.env.PHISHING_WARNING_PAGE_URL,
    ); // 构造警告页URL [注：使用环境变量配置]
    // `extensionStartup`哈希向钓鱼警告页指示不应设置用户交互流，否则会导致控制台错误
    extensionStartupPhishingPageUrl.hash = '#extensionStartup'; // 添加启动参数 [注：禁用交互流避免错误]

    iframe = window.document.createElement('iframe'); // 创建iframe元素 [注：沙箱环境加载]
    iframe.setAttribute('src', extensionStartupPhishingPageUrl.href); // 设置源地址 [注：加载警告页]
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin'); // 沙箱策略 [注：限制iframe权限]

    // 创建延迟Promise以允许将resolve/reject传递给事件处理程序
    let deferredResolve; // 解析函数 [注：Promise延迟处理]
    let deferredReject; // 拒绝函数 [注：Promise延迟处理]
    const loadComplete = new Promise((resolve, reject) => {
      deferredResolve = resolve;
      deferredReject = reject;
    }); // 创建加载完成Promise [注：处理异步加载]

    // 加载事件在加载完成时触发，即使加载失败（失败时不处理）
    iframe.addEventListener('load', deferredResolve); // 监听加载完成事件 [注：触发Promise解析]

    // 插入iframe到页面主体，开始加载
    window.document.body.appendChild(iframe); // 插入DOM [注：触发页面加载]

    // 超时确保iframe在合理时间内清理，避免初始化消息延迟
    setTimeout(
      () => deferredReject(new PhishingWarningPageTimeoutError()), // 超时处理 [注：1秒后触发拒绝]
      PHISHING_WARNING_PAGE_TIMEOUT,
    );

    await loadComplete; // 等待加载完成或超时 [注：异步等待]

    // 在会话存储中标记已加载服务 worker，避免重复加载
    if (currentPlatform === PLATFORM_FIREFOX) {
      // Firefox尚不支持MV3的storage.session API（跟踪中：https://bugzilla.mozilla.org/show_bug.cgi?id=1687778）
      console.error(
        'Firefox does not support required MV3 APIs: Phishing warning page iframe and service worker will reload each page refresh',
      ); // 记录Firefox兼容性问题 [注：已知问题提示]
    } else {
      browser.storage.session.set({
        [PHISHING_WARNING_SW_STORAGE_KEY]: true,
      }); // 存储标记 [注：现代浏览器支持]
    }
  } catch (error) {
    if (error instanceof PhishingWarningPageTimeoutError) {
      console.warn(
        'Phishing warning page timeout; page not guaranteed to work offline.', // 记录超时警告 [注：不影响主流程]
      );
    } else {
      console.error('Failed to initialize phishing warning page', error); // 记录其他错误 [注：可能影响离线功能]
    }
  } finally {
    if (iframe) {
      iframe.remove(); // 清理iframe [注：释放资源]
    }
  }
}

async function initializeUiWithTab(
  tab, // 当前活动标签页信息 [注：包含URL、来源等]
  connectionStream, // 与后台的连接流 [注：通信通道]
  windowType, // 窗口类型（弹窗/全屏等） [注：UI布局判断]
  traceContext, // 追踪上下文 [注：性能分析]
) {
  try {
    const store = await initializeUi(tab, connectionStream, traceContext); // 初始化UI并获取状态存储 [注：核心初始化函数]

    endTrace({ name: TraceName.UIStartup }); // 结束UI启动追踪 [注：性能分析]

    isUIInitialised = true; // 标记UI已初始化 [注：避免重复初始化]

    if (process.env.IN_TEST) {
      window.document?.documentElement?.classList.add('controller-loaded'); // 测试环境标记 [注：用于UI测试]
    }

    const state = store.getState(); // 获取当前状态 [注：包含账户、网络等信息]
    const { metamask: { completedOnboarding } = {} } = state; // 提取引导完成状态 [注：判断用户是否完成初始化]

    if (!completedOnboarding && windowType !== ENVIRONMENT_TYPE_FULLSCREEN) {
      global.platform.openExtensionInBrowser(); // 打开扩展页面 [注：引导新用户完成配置]
    }
  } catch (err) {
    displayCriticalError('troubleStarting', err); // 显示严重错误页面 [注：用户可见的错误提示]
  }
}

// 在UI中更新新的后台连接
function updateUiStreams(connectionStream) {
  const backgroundConnection = connectToAccountManager(connectionStream); // 创建后台连接 [注：获取账户管理器连接]
  updateBackgroundConnection(backgroundConnection); // 更新UI连接状态 [注：同步后台通信通道]
}

async function queryCurrentActiveTab(windowType) {
  // 仅在E2E测试运行时模拟活动标签页（如果设置了"activeTabOrigin"查询参数）
  if (process.env.IN_TEST) {
    // 测试环境处理 [注：模拟测试数据]
    const searchParams = new URLSearchParams(window.location.search); // 解析URL参数 [注：获取测试用Origin]
    const mockUrl = searchParams.get('activeTabOrigin');
    if (mockUrl) {
      const { origin, protocol } = new URL(mockUrl); // 解析模拟URL [注：构造测试用标签页数据]
      const returnUrl = {
        id: 'mock-site',
        title: 'Mock Site',
        url: mockUrl,
        origin,
        protocol,
      };
      return returnUrl; // 返回模拟标签页 [注：供测试使用]
    }
  }

  // 目前只有"activeTab"权限，意味着此查询仅在弹窗上下文中成功（即点击浏览器动作后）
  if (windowType !== ENVIRONMENT_TYPE_POPUP) {
    // 非弹窗环境处理 [注：权限限制]
    return {};
  }

  const tabs = await browser.tabs
    .query({ active: true, currentWindow: true }) // 查询当前活动标签页 [注：浏览器API调用]
    .catch((e) => {
      checkForLastErrorAndLog() || log.error(e); // 错误处理 [注：记录查询错误]
    });

  const [activeTab] = tabs; // 提取首个标签页 [注：假设单标签页场景]
  const { id, title, url } = activeTab; // 提取标签页信息 [注：包含ID、标题、URL]
  const { origin, protocol } = url ? new URL(url) : {}; // 解析URL [注：获取来源和协议]

  if (!origin || origin === 'null') {
    // 无效来源处理 [注：过滤无效标签页]
    return {};
  }

  return { id, title, origin, protocol, url }; // 返回有效标签页信息 [注：供UI初始化使用]
}

async function initializeUi(activeTab, connectionStream, traceContext) {
  const backgroundConnection = connectToAccountManager(connectionStream); // 建立后台连接 [注：核心通信通道]

  return await launchMetaMaskUi({
    // 启动MetaMask UI [注：传入初始化参数]
    activeTab,
    container,
    backgroundConnection,
    traceContext,
  });
}

async function displayCriticalError(errorKey, err, metamaskState) {
  const html = await getErrorHtml(errorKey, SUPPORT_LINK, metamaskState); // 生成错误页面HTML [注：包含支持链接]

  container.innerHTML = html; // 渲染错误页面 [注：替换主内容区域]

  const button = document.getElementById('critical-error-button'); // 获取重试按钮 [注：用户操作入口]

  button?.addEventListener('click', (_) => {
    // 监听重试点击 [注：重启扩展]
    browser.runtime.reload();
  });

  log.error(err.stack); // 记录错误堆栈 [注：开发调试]
  throw err; // 重新抛出错误 [注：确保错误追踪]
}

/**
 * 建立与后台和Web3提供者的连接
 *
 * @param {PortDuplexStream} connectionStream - 建立后台连接的PortStream实例 [注：通信流参数]
 */
function connectToAccountManager(connectionStream) {
  const mx = setupMultiplex(connectionStream); // 创建多路复用器 [注：管理多个子流]
  const controllerConnectionStream = mx.createStream('controller'); // 创建控制器子流 [注：专用通信通道]

  const backgroundConnection = setupControllerConnection(
    controllerConnectionStream, // 建立控制器连接 [注：后台核心模块通信]
  );

  setupWeb3Connection(mx.createStream('provider')); // 建立Web3连接 [注：区块链提供者通信]

  return backgroundConnection; // 返回后台连接实例 [注：供UI使用]
}

/**
 * 建立到Web3提供者的流连接
 *
 * @param {PortDuplexStream} connectionStream - 建立后台连接的PortStream实例 [注：通信流参数]
 */
function setupWeb3Connection(connectionStream) {
  const providerStream = new StreamProvider(connectionStream, {
    // 创建流提供者 [注：支持RPC通信]
    rpcMiddleware: [createIdRemapMiddleware()], // 添加ID重映射中间件 [注：请求ID管理]
  });
  connectionStream.on('error', console.error.bind(console)); // 监听流错误 [注：统一错误处理]
  providerStream.on('error', console.error.bind(console)); // 监听提供者错误 [注：统一错误处理]
  providerStream.initialize().then(() => {
    // 初始化提供者流 [注：准备就绪回调]
    global.ethereumProvider = providerStream; // 暴露全局提供者 [注：供页面脚本使用]
  });
}

/**
 * 建立到后台账户管理器的流连接
 *
 * @param {PortDuplexStream} controllerConnectionStream - 建立后台连接的PortStream实例 [注：通信流参数]
 */
function setupControllerConnection(controllerConnectionStream) {
  return metaRPCClientFactory(controllerConnectionStream); // 创建RPC客户端 [注：后台控制器通信]
}
