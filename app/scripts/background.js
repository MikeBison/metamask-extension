/**
 * @file 浏览器扩展单例进程的入口点。 [注：作为后台服务的主入口，管理扩展核心逻辑]
 */

// 禁用以便首先设置初始状态钩子 [注：确保Sentry等核心功能初始化前置]
// 此导入设置Sentry所需的全局函数。 [注：必须首先执行以捕获后续初始化错误]
import './lib/setup-initial-state-hooks';

import EventEmitter from 'events';
import { finished, pipeline } from 'readable-stream';
import debounce from 'debounce-stream';
import log from 'loglevel';
import browser from 'webextension-polyfill';
import { storeAsStream } from '@metamask/obs-store';
import { isObject } from '@metamask/utils';
import PortStream from 'extension-port-stream';
import { NotificationServicesController } from '@metamask/notification-services-controller';

import {
  ENVIRONMENT_TYPE_POPUP,
  ENVIRONMENT_TYPE_NOTIFICATION,
  ENVIRONMENT_TYPE_FULLSCREEN,
  EXTENSION_MESSAGES,
  PLATFORM_FIREFOX,
  MESSAGE_TYPE,
} from '../../shared/constants/app'; // 导入应用环境相关常量 [注：用于区分扩展不同运行环境]
import {
  REJECT_NOTIFICATION_CLOSE,
  REJECT_NOTIFICATION_CLOSE_SIG,
  MetaMetricsEventCategory,
  MetaMetricsEventName,
  MetaMetricsUserTrait,
} from '../../shared/constants/metametrics'; // 导入元数据事件常量 [注：用于用户行为统计]
import { checkForLastErrorAndLog } from '../../shared/modules/browser-runtime.utils'; // 错误处理工具 [注：统一日志记录和错误捕获]
import { isManifestV3 } from '../../shared/modules/mv3.utils'; // 检测浏览器清单版本 [注：区分MV2/MV3不同逻辑]
import { maskObject } from '../../shared/modules/object.utils'; // 对象掩码工具 [注：敏感数据处理]
import { FIXTURE_STATE_METADATA_VERSION } from '../../test/e2e/default-fixture'; // 测试夹具版本号 [注：用于初始化测试状态]
import { getSocketBackgroundToMocha } from '../../test/e2e/background-socket/socket-background-to-mocha'; // 测试用Socket连接 [注：Mocha测试框架通信]
import {
  OffscreenCommunicationTarget,
  OffscreenCommunicationEvents,
} from '../../shared/constants/offscreen-communication'; // 离线通信常量 [注：MV3离线文档通信]
import {
  FakeLedgerBridge,
  FakeTrezorBridge,
} from '../../test/stub/keyring-bridge'; // 硬件钱包模拟桥接 [注：测试环境替代真实设备]
import { getCurrentChainId } from '../../shared/modules/selectors/networks'; // 获取当前链ID [注：多链环境核心选择器]
import getFetchWithTimeout from '../../shared/modules/fetch-with-timeout'; // 带超时的Fetch工具 [注：网络请求异常处理]
import { PersistenceManager } from './lib/stores/persistence-manager'; // 持久化管理器 [注：状态存储核心类]
import ExtensionStore from './lib/stores/extension-store'; // 扩展存储 [注：生产环境状态存储]
import ReadOnlyNetworkStore from './lib/stores/read-only-network-store'; // 只读网络存储 [注：测试环境静态数据]
import migrations from './migrations'; // 数据迁移脚本 [注：版本升级时状态迁移]
import Migrator from './lib/migrator'; // 迁移器 [注：管理状态迁移流程]
import ExtensionPlatform from './platforms/extension'; // 扩展平台抽象 [注：浏览器API封装]
import { SENTRY_BACKGROUND_STATE } from './constants/sentry-state'; // Sentry状态配置 [注：监控后台状态字段]

import createStreamSink from './lib/createStreamSink'; // 创建流接收器 [注：状态持久化流处理]
import NotificationManager, {
  NOTIFICATION_MANAGER_EVENTS,
} from './lib/notification-manager'; // 通知管理器 [注：处理弹出通知逻辑]
import MetamaskController, {
  METAMASK_CONTROLLER_EVENTS,
} from './metamask-controller'; // MetaMask核心控制器 [注：协调各模块交互]
import getFirstPreferredLangCode from './lib/get-first-preferred-lang-code'; // 获取首选语言 [注：国际化支持]
import getObjStructure from './lib/getObjStructure'; // 获取对象结构 [注：敏感数据脱敏处理]
import setupEnsIpfsResolver from './lib/ens-ipfs/setup'; // 配置ENS/IPFS解析器 [注：域名解析功能]
import {
  deferredPromise,
  getPlatform,
  shouldEmitDappViewedEvent,
} from './lib/util'; // 工具函数集 [注：包含延迟Promise、平台检测等]
import { createOffscreen } from './offscreen'; // 创建离线文档 [注：MV3离线功能支持]
import { generateWalletState } from './fixtures/generate-wallet-state'; // 生成钱包状态 [注：测试数据生成]
import rawFirstTimeState from './first-time-state'; // 初始状态模板 [注：新安装时默认配置]

/* eslint-enable import/first */

import { COOKIE_ID_MARKETING_WHITELIST_ORIGINS } from './constants/marketing-site-whitelist'; // 营销域名白名单 [注：Cookie策略豁免列表]
import { PREINSTALLED_SNAPS_URLS } from './constants/snaps'; // 预装Snaps地址 [注：初始化加载第三方扩展]

// eslint-disable-next-line @metamask/design-tokens/color-no-hex
const BADGE_COLOR_APPROVAL = '#0376C9'; // 审批徽章颜色 [注：蓝色表示待审批事项]
// eslint-disable-next-line @metamask/design-tokens/color-no-hex
const BADGE_COLOR_NOTIFICATION = '#D73847'; // 通知徽章颜色 [注：红色表示未读通知]
const BADGE_MAX_COUNT = 9; // 徽章最大显示数 [注：超过显示为9+]

// 设置全局钩子以优化初始化期间的Sentry状态快照 [注：错误监控增强]
const inTest = process.env.IN_TEST;
const migrator = new Migrator({
  migrations,
  defaultVersion: process.env.WITH_STATE
    ? FIXTURE_STATE_METADATA_VERSION
    : null,
}); // 初始化数据迁移器 [注：根据环境选择默认版本]

const localStore = inTest ? new ReadOnlyNetworkStore() : new ExtensionStore(); // 初始化本地存储 [注：测试环境使用只读存储]
const persistenceManager = new PersistenceManager({ localStore }); // 初始化持久化管理器 [注：管理状态存储与读取]
global.stateHooks.getMostRecentPersistedState = () =>
  persistenceManager.mostRecentRetrievedState; // 暴露全局状态钩子 [注：供Sentry获取最新持久化状态]

const { sentry } = global;
let firstTimeState = { ...rawFirstTimeState }; // 初始化首次状态 [注：合并默认模板]

const metamaskInternalProcessHash = {
  [ENVIRONMENT_TYPE_POPUP]: true,
  [ENVIRONMENT_TYPE_NOTIFICATION]: true,
  [ENVIRONMENT_TYPE_FULLSCREEN]: true,
}; // 内部进程标识 [注：区分可信的扩展内环境]

const metamaskBlockedPorts = ['trezor-connect']; // 阻塞端口列表 [注：禁止特定设备连接]

log.setLevel(process.env.METAMASK_DEBUG ? 'debug' : 'info', false); // 配置日志级别 [注：调试模式启用详细日志]

const platform = new ExtensionPlatform(); // 初始化平台实例 [注：封装浏览器差异API]
const notificationManager = new NotificationManager(); // 初始化通知管理器 [注：控制弹出窗口逻辑]
const isFirefox = getPlatform() === PLATFORM_FIREFOX; // 检测Firefox平台 [注：处理浏览器特定逻辑]

let openPopupCount = 0; // 弹出窗口计数 [注：跟踪当前打开的Popup数量]
let notificationIsOpen = false; // 通知窗口状态 [注：标记通知是否打开]
let uiIsTriggering = false; // UI触发状态 [注：防止重复打开Popup]
const openMetamaskTabsIDs = {}; // 打开的标签页ID [注：跟踪全屏模式标签]
const requestAccountTabIds = {}; // 请求账户的标签页ID [注：记录需要账户权限的标签]
let controller; // 核心控制器实例 [注：延迟初始化，在setupController中赋值]
const tabOriginMapping = {}; // 标签页来源映射 [注：存储标签页对应的DApp原点]

if (inTest || process.env.METAMASK_DEBUG) {
  global.stateHooks.metamaskGetState =
    persistenceManager.get.bind(persistenceManager); // 暴露调试用状态获取钩子 [注：测试环境访问存储数据]
}

const phishingPageUrl = new URL(process.env.PHISHING_WARNING_PAGE_URL); // 钓鱼警告页URL [注：标准化处理URL]

// 规范化URL（如果缺少则添加域名后缀斜杠）并重复使用：
const phishingPageHref = phishingPageUrl.toString();

const ONE_SECOND_IN_MILLISECONDS = 1_000;
// 初始化钓鱼警告页的超时时间。 [注：防止长时间阻塞初始化流程]
const PHISHING_WARNING_PAGE_TIMEOUT = ONE_SECOND_IN_MILLISECONDS;

// 状态持久化事件发射器 [注：用于通知状态变更]
export const statePersistenceEvents = new EventEmitter();

if (!isManifestV3) {
  /**
   * `onInstalled`事件处理器。 [注：处理扩展安装/更新事件]
   *
   * 在MV3构建中，我们必须在`app-init`中监听此事件，否则监听器永远不会被调用。
   * MV2构建中没有`app-init`文件，因此我们在这里添加监听器。
   *
   * @param {import('webextension-polyfill').Runtime.OnInstalledDetailsType} details - 事件详情。
   */
  const onInstalledListener = (details) => {
    if (details.reason === 'install') {
      onInstall(); // 触发首次安装逻辑 [注：仅在首次安装时执行]
      browser.runtime.onInstalled.removeListener(onInstalledListener); // 移除监听器避免重复触发
    }
  };

  browser.runtime.onInstalled.addListener(onInstalledListener);

  // 此条件处理`app-init`中的监听器在`background.js`加载前被调用的情况。
} else if (globalThis.stateHooks.metamaskWasJustInstalled) {
  onInstall(); // 处理MV3下的安装事件 [注：全局状态标记安装完成]
  // 删除以清理全局命名空间
  delete globalThis.stateHooks.metamaskWasJustInstalled;
  // 此条件处理`background.js`加载前监听器被调用的情况。
} else {
  globalThis.stateHooks.metamaskTriggerOnInstall = () => onInstall(); // 暴露安装触发钩子 [注：供其他模块调用]
}

/**
 * 此延迟Promise用于跟踪初始化是否完成。 [注：确保初始化状态可被外部等待]
 *
 * 确保在初始化完成后始终调用`resolveInitialization`，并在不可恢复的初始化失败时调用`rejectInitialization`非常重要。
 */
const {
  promise: isInitialized,
  resolve: resolveInitialization,
  reject: rejectInitialization,
} = deferredPromise();

/**
 * 向所有标签页发送消息，通知内容脚本可以连接后台。 [注：Service Worker恢复后重建DApp连接]
 */
const sendReadyMessageToTabs = async () => {
  const tabs = await browser.tabs
    .query({
      /**
       * 仅查询扩展可运行的标签页。为此，我们查询所有扩展可注入脚本的URL，通过使用"<all_urls>"值且不包含"tabs"清单权限。
       * 如果包含"tabs"权限，这还会获取我们无法注入的URL，例如chrome://页面、chrome://扩展，这不是我们想要的。
       *
       * 你可能想知道，没有"tabs"权限时"url"参数如何工作？
       *
       * @see {@link https://bugs.chromium.org/p/chromium/issues/detail?id=661311#c1}
       *  "如果扩展有权限向标签页注入脚本，那么我们可以返回标签页的URL（因为扩展可以注入脚本以消息传递location.href）。"
       */
      url: '<all_urls>',
      windowType: 'normal',
    })
    .then((result) => {
      checkForLastErrorAndLog(); // 统一错误处理 [注：记录查询标签页时的错误]
      return result;
    })
    .catch(() => {
      checkForLastErrorAndLog(); // 捕获异常并记录 [注：忽略查询失败]
    });

  /** @todo 我们应该只向DApp标签页发送消息，而不是所有标签页。 */
  for (const tab of tabs) {
    browser.tabs
      .sendMessage(tab.id, {
        name: EXTENSION_MESSAGES.READY,
      })
      .then(() => {
        checkForLastErrorAndLog(); // 记录消息发送成功
      })
      .catch(() => {
        // 如果内容脚本加载被阻止，可能会发生错误，
        // 因此没有runtime.onMessage处理程序来监听消息。
        checkForLastErrorAndLog(); // 记录消息发送失败 [注：内容脚本未加载时忽略]
      });
  }
};

/**
 * 启动钓鱼检测功能。 [注：核心安全功能，拦截恶意页面]
 * 注册webRequest拦截器，检测钓鱼页面并重定向到警告页。
 * 兼容MV2/MV3，不同平台采用不同拦截方式。
 *
 * @param {MetamaskController} theController - 主控制器实例 [注：依赖控制器中的钓鱼检测逻辑]
 */
function maybeDetectPhishing(theController) {
  async function redirectTab(tabId, url) {
    try {
      return await browser.tabs.update(tabId, {
        url,
      }); // 重定向标签页 [注：浏览器API操作]
    } catch (error) {
      return sentry?.captureException(error); // 捕获异常并上报Sentry [注：错误监控]
    }
  }
  // MV2支持阻塞API，MV3不支持
  const isManifestV2 = !isManifestV3;
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId === browser.tabs.TAB_ID_NONE) {
        return {}; // 忽略无标签页的请求 [注：如后台请求]
      }

      const { completedOnboarding } = theController.onboardingController.state;
      if (!completedOnboarding) {
        return {}; // 未完成引导时跳过检测 [注：新用户暂不启用钓鱼检测]
      }

      const prefState = theController.preferencesController.state;
      if (!prefState.usePhishDetect) {
        return {}; // 用户禁用钓鱼检测时跳过 [注：尊重用户设置]
      }

      // 忽略来自钓鱼警告页的请求，因为
      // 请求可能来自"继续访问站点"链接，因此我们实际上需要绕过钓鱼检测。
      // 我们本不应需要这样做，因为钓鱼站点会在请求开始后（会被此监听器阻止）告诉扩展该域名现在"安全"。
      // 此检查可在https://github.com/MetaMask/phishing-warning/issues/160发布后移除。
      if (
        details.initiator &&
        details.initiator !== 'null' &&
        // 比较规范化的URL
        new URL(details.initiator).host === phishingPageUrl.host
      ) {
        return {}; // 信任钓鱼警告页发起的请求 [注：避免循环拦截]
      }

      const { hostname, href, searchParams } = new URL(details.url);
      if (inTest) {
        if (searchParams.has('IN_TEST_BYPASS_EARLY_PHISHING_DETECTION')) {
          // 这是需要绕过早期钓鱼检测的测试页面
          return {}; // 测试环境跳过检测 [注：允许测试页面通过]
        }
      }

      theController.phishingController.maybeUpdateState(); // 更新钓鱼检测状态 [注：获取最新黑名单]

      const blockedRequestResponse =
        theController.phishingController.isBlockedRequest(details.url); // 检查请求是否被阻止 [注：基于本地黑名单]

      let phishingTestResponse;
      if (details.type === 'main_frame' || details.type === 'sub_frame') {
        phishingTestResponse = theController.phishingController.test(
          details.url,
        ); // 执行钓鱼测试 [注：分析页面内容特征]
      }

      // 如果请求未被阻止且钓鱼测试未阻止，返回不显示钓鱼屏幕
      if (!phishingTestResponse?.result && !blockedRequestResponse.result) {
        return {};
      }

      // 根据类型确定阻止原因
      let blockReason;
      let blockedUrl = hostname;
      if (phishingTestResponse?.result && blockedRequestResponse.result) {
        blockReason = `${phishingTestResponse.type} and ${blockedRequestResponse.type}`; // 复合原因 [注：同时触发两种检测]
      } else if (phishingTestResponse?.result) {
        blockReason = phishingTestResponse.type; // 钓鱼测试触发 [注：内容匹配钓鱼特征]
      } else {
        blockReason = blockedRequestResponse.type; // 黑名单触发 [注：域名在阻止列表中]
        blockedUrl = details.initiator;
      }

      theController.metaMetricsController.trackEvent({
        // 是否应区分后台重定向和内容脚本重定向？
        event: MetaMetricsEventName.PhishingPageDisplayed,
        category: MetaMetricsEventCategory.Phishing,
        properties: {
          url: blockedUrl,
          referrer: {
            url: blockedUrl,
          },
          reason: blockReason,
          requestDomain: blockedRequestResponse.result ? hostname : undefined,
        },
      }); // 记录钓鱼事件 [注：用户行为统计]
      const querystring = new URLSearchParams({ hostname, href });
      const redirectUrl = new URL(phishingPageHref);
      redirectUrl.hash = querystring.toString(); // 构造重定向URL [注：携带原URL参数]
      const redirectHref = redirectUrl.toString();

      // 阻止比标签页重定向更好，因为阻止会防止浏览器加载页面
      if (isManifestV2) {
        // 我们可以直接将`main_frame`请求重定向到警告页。
        // 对于非`main_frame`请求（如`sub_frame`或WebSocket），我们取消它们并异步重定向整个标签页，以便用户看到警告。
        if (details.type === 'main_frame') {
          return { redirectUrl: redirectHref }; // 直接重定向主框架 [注：MV2支持阻塞式重定向]
        }
        redirectTab(details.tabId, redirectHref); // 重定向非主框架请求 [注：先取消请求再跳转]
        return { cancel: true };
      }
      // 重定向整个标签页（即使是子框架请求） [注：MV3统一处理方式]
      redirectTab(details.tabId, redirectHref);
      return {};
    },
    {
      urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'], // 监控所有HTTP/WS请求 [注：全协议覆盖]
    },
    isManifestV2 ? ['blocking'] : [], // MV2启用阻塞模式 [注：版本兼容性处理]
  );
}

// 这些在初始化后设置
let connectRemote;
let connectExternalExtension;
let connectExternalCaip;

browser.runtime.onConnect.addListener(async (...args) => {
  // 在此排队连接尝试，等待初始化完成 [注：确保控制器已初始化]
  await isInitialized;

  // 这在`setupController`中设置，作为初始化的一部分
  connectRemote(...args); // 处理内部连接 [注：扩展内可信端口]
});
browser.runtime.onConnectExternal.addListener(async (...args) => {
  // 在此排队连接尝试，等待初始化完成
  await isInitialized;
  // 这在`setupController`中设置，作为初始化的一部分

  const port = args[0];
  const isDappConnecting = port.sender.tab?.id;
  if (isDappConnecting && process.env.MULTICHAIN_API) {
    connectExternalCaip(...args); // 处理多链DApp连接 [注：支持CAIP-26标准]
  } else {
    connectExternalExtension(...args); // 处理外部扩展连接 [注：EIP-1193标准通信]
  }
});

function saveTimestamp() {
  const timestamp = new Date().toISOString(); // 生成时间戳 [注：用于保持Service Worker活动]

  browser.storage.session.set({ timestamp }); // 保存到会话存储 [注：MV3定时触发保持服务运行]
}

/**
 * @typedef {import('@metamask/transaction-controller').TransactionMeta} TransactionMeta
 */

/**
 * 从MetaMaskController.store EventEmitter发出的数据，也用于初始化MetaMaskController。在UI的React状态中作为state.metamask可用。
 *
 * @typedef MetaMaskState
 * @property {boolean} isInitialized - 第一个钱包是否已创建。 [注：初始化状态标记]
 * @property {boolean} isUnlocked - 钱包当前是否已解密且账户可选择。 [注：安全状态标记]
 * @property {boolean} isAccountMenuOpen - 表示主账户选择UI是否当前显示。 [注：UI状态跟踪]
 * @property {boolean} isNetworkMenuOpen - 表示主网络选择UI是否当前显示。 [注：UI状态跟踪]
 * @property {object} identities - 小写十六进制地址到包含"address"和"name"（昵称）键的Identity对象的对象。 [注：账户身份信息]
 * @property {object} networkConfigurations - 网络配置列表，包含RPC提供程序详细信息（如chainId、rpcUrl、rpcPreferences）。 [注：多链配置存储]
 * @property {Array} addressBook - 先前发送到的地址列表。 [注：历史地址记录]
 * @property {object} marketData - 从链ID到合约地址到包含代币市场数据的对象的映射。 [注：市场数据缓存]
 * @property {Array} tokens - 当前用户持有的代币，包括余额。 [注：钱包资产列表]
 * @property {object} send - TODO: 文档 [注：待完善的发送功能状态]
 * @property {boolean} useBlockie - 表示首选用户头像格式。true为blockie，false为Jazzicon。 [注：用户界面偏好]
 * @property {object} featureFlags - 可选功能标志的对象。 [注：实验性功能开关]
 * @property {boolean} welcomeScreen - 是否应显示欢迎屏幕。 [注：新用户引导]
 * @property {string} currentLocale - 与用户首选显示语言匹配的区域设置字符串。 [注：国际化配置]
 * @property {string} networkStatus - 根据当前所选网络的状态，为"unknown"、"available"、"unavailable"或"blocked"。 [注：网络连接状态]
 * @property {object} accounts - 小写十六进制地址到包含"balance"和"address"键的对象的映射，均存储十六进制字符串值。 [注：账户余额信息]
 * @property {object} accountsByChainId - 按链ID键控的小写十六进制地址到包含"balance"和"address"键的对象的映射，均存储十六进制字符串值。 [注：多链账户余额]
 * @property {hex} currentBlockGasLimit - 最近看到的区块gas限制，采用小写十六进制前缀字符串。 [注：Gas费相关状态]
 * @property {object} currentBlockGasLimitByChainId - 按链ID键控的最近看到的区块gas限制，采用小写十六进制前缀字符串。 [注：多链Gas费跟踪]
 * @property {object} unapprovedPersonalMsgs - 待批准消息的对象，将唯一ID映射到选项。 [注：未批准的个人消息]
 * @property {number} unapprovedPersonalMsgCount - unapprovedPersonalMsgs中的消息数量。 [注：计数器]
 * @property {object} unapprovedEncryptionPublicKeyMsgs - 待批准的加密公钥消息的对象，将唯一ID映射到选项。 [注：未批准的加密请求]
 * @property {number} unapprovedEncryptionPublicKeyMsgCount - EncryptionPublicKeyMsgs中的消息数量。 [注：计数器]
 * @property {object} unapprovedDecryptMsgs - 待批准的解密消息的对象，将唯一ID映射到选项。 [注：未批准的解密请求]
 * @property {number} unapprovedDecryptMsgCount - unapprovedDecryptMsgs中的消息数量。 [注：计数器]
 * @property {object} unapprovedTypedMessages - 待批准的类型化消息的对象，将唯一ID映射到选项。 [注：未批准的类型化请求]
 * @property {number} unapprovedTypedMessagesCount - unapprovedTypedMessages中的消息数量。 [注：计数器]
 * @property {number} pendingApprovalCount - 批准控制器中的待处理请求数量。 [注：总待批准计数]
 * @property {Keyring[]} keyrings - 密钥环描述数组，总结可用账户及其所属密钥环。 [注：硬件钱包管理]
 * @property {string} selectedAddress - 当前所选地址的小写十六进制字符串。 [注：当前活动账户]
 * @property {string} currentCurrency - 标识用户首选显示货币的字符串，用于显示汇率。 [注：法币转换配置]
 * @property {number} currencyRates - 原生货币到汇率和日期的对象映射 [注：汇率数据]
 * @property {boolean} forgottenPassword - 用户是否已启动密码恢复屏幕（从助记词恢复）时返回true。 [注：密码恢复状态]
 */

/**
 * @typedef VersionedData
 * @property {MetaMaskState} data - 从MetaMask控制器发出的数据，或用于初始化的数据。 [注：带版本的状态数据]
 * @property {number} version - 已运行的最新迁移版本。 [注：数据迁移版本号]
 */

/**
 * 初始化MetaMask控制器，并设置所有平台配置。 [注：核心初始化流程]
 *
 * @returns {Promise} 安装完成。
 */
/**
 * 初始化MetaMask控制器及相关平台配置。 [注：分10步完成核心初始化]
 * 1. 加载持久化状态
 * 2. 获取用户首选语言
 * 3. （测试环境）启动mocha socket
 * 4. （MV3）定时保存时间戳，保持service worker存活
 * 5. 加载预装Snaps
 * 6. 调用setupController完成控制器初始化
 * 7. 启动钓鱼检测
 * 8. （MV2）预加载钓鱼警告页
 * 9. 通知所有标签页后台已准备好
 * 10. 标记初始化完成
 */
async function initialize() {
  try {
    const offscreenPromise = isManifestV3 ? createOffscreen() : null; // 初始化离线文档 [注：MV3特有功能]

    const initData = await loadStateFromPersistence(); // 加载持久化状态 [注：包含版本迁移]

    const initState = initData.data;
    const initLangCode = await getFirstPreferredLangCode(); // 获取首选语言 [注：用于国际化]

    let isFirstMetaMaskControllerSetup;

    // 仅在运行测试构建时启动，而非发布构建。
    // 当Selenium、Puppeteer或Playwright运行时，`navigator.webdriver`为true。
    // 在MV3中，Service Worker将`navigator.webdriver`视为`undefined`，因此这将通过离线文档消息触发。
    // 由于是单例类，多次启动是安全的。
    // 测试环境下启动mocha socket [注：测试框架通信接口]
    if (process.env.IN_TEST && window.navigator?.webdriver) {
      getSocketBackgroundToMocha();
    }

    if (isManifestV3) {
      // 立即保存时间戳，然后每隔`SAVE_TIMESTAMP_INTERVAL`毫秒保存一次。这使服务工作线程保持活动状态。
      // MV3下定时保存时间戳，保持service worker存活 [注：防止后台被浏览器终止]
      if (initState.PreferencesController?.enableMV3TimestampSave !== false) {
        const SAVE_TIMESTAMP_INTERVAL_MS = 2 * 1000;

        saveTimestamp();
        setInterval(saveTimestamp, SAVE_TIMESTAMP_INTERVAL_MS); // 定时任务 [注：每2秒更新时间戳]
      }

      const sessionData = await browser.storage.session.get([
        'isFirstMetaMaskControllerSetup',
      ]);

      isFirstMetaMaskControllerSetup =
        sessionData?.isFirstMetaMaskControllerSetup === undefined;
      await browser.storage.session.set({ isFirstMetaMaskControllerSetup }); // 记录首次初始化状态 [注：避免重复设置]
    }

    const overrides = inTest
      ? {
          keyrings: {
            trezorBridge: FakeTrezorBridge,
            ledgerBridge: FakeLedgerBridge,
          },
        }
      : {}; // 测试覆盖项 [注：替换硬件钱包实现]

    const preinstalledSnaps = await loadPreinstalledSnaps(); // 加载预装Snaps [注：第三方扩展初始化]

    setupController(
      initState,
      initLangCode,
      overrides,
      isFirstMetaMaskControllerSetup,
      initData.meta,
      offscreenPromise,
      preinstalledSnaps,
    ); // 初始化控制器 [注：核心模块协调]

    // `setupController`设置`controller`对象，现在可以使用：
    maybeDetectPhishing(controller); // 启动钓鱼检测 [注：依赖控制器的钓鱼模块]

    if (!isManifestV3) {
      await loadPhishingWarningPage(); // 预加载钓鱼页 [注：MV2需要提前加载iframe]
    }
    await sendReadyMessageToTabs(); // 通知标签页 [注：完成初始化标志]
    log.info('MetaMask initialization complete.');

    resolveInitialization(); // 标记初始化成功 [注：解除初始化Promise阻塞]
  } catch (error) {
    rejectInitialization(error); // 初始化失败处理 [注：触发错误流程]
  }
}

/**
 * 从URL加载预装的snaps并作为数组返回。 [注：扩展生态初始化]
 * 如果任何Snap在预期时间范围内加载失败，则失败。
 */
async function loadPreinstalledSnaps() {
  const fetchWithTimeout = getFetchWithTimeout(); // 获取带超时的Fetch工具 [注：网络请求容错]
  const promises = PREINSTALLED_SNAPS_URLS.map(async (url) => {
    const response = await fetchWithTimeout(url);
    return await response.json(); // 解析Snaps配置 [注：JSON格式验证]
  });

  return Promise.all(promises); // 并行加载所有Snaps [注：提高初始化效率]
}

/**
 * 钓鱼警告页加载超时抛出的错误。 [注：超时处理类]
 */
class PhishingWarningPageTimeoutError extends Error {
  constructor() {
    super('Timeout failed');
  }
}

/**
 * 预加载钓鱼警告页，确保service worker已注册，警告页可离线工作。 [注：提升离线场景安全性]
 * 通过创建iframe加载警告页，超时后自动清理。
 */
async function loadPhishingWarningPage() {
  let iframe;
  try {
    const extensionStartupPhishingPageUrl = new URL(phishingPageHref);
    // `extensionStartup`哈希向钓鱼警告页指示不应设置用户交互流。否则此页面加载会导致控制台错误。
    extensionStartupPhishingPageUrl.hash = '#extensionStartup'; // 附加启动参数 [注：禁用交互避免错误]

    iframe = window.document.createElement('iframe');
    iframe.setAttribute('src', extensionStartupPhishingPageUrl.href);
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin'); // 沙箱策略 [注：限制iframe权限]

    // 创建延迟Promise以允许将resolve/reject传递给事件处理程序
    let deferredResolve;
    let deferredReject;
    const loadComplete = new Promise((resolve, reject) => {
      deferredResolve = resolve;
      deferredReject = reject;
    });

    // 加载事件在加载完成时发出，即使加载失败。
    // 如果加载失败我们无法做什么，因此无需检查。
    iframe.addEventListener('load', deferredResolve); // 监听加载完成 [注：触发Promise解析]

    // 此步骤启动页面加载。
    window.document.body.appendChild(iframe); // 插入iframe [注：预加载页面资源]

    // 此超时确保此iframe在合理时间内清理，并确保"初始化完成"消息不会延迟太久。
    setTimeout(
      () => deferredReject(new PhishingWarningPageTimeoutError()),
      PHISHING_WARNING_PAGE_TIMEOUT,
    );
    await loadComplete; // 等待加载或超时 [注：设置1秒超时限制]
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
      iframe.remove(); // 清理资源 [注：避免内存泄漏]
    }
  }
}

//
// 状态和持久化
//

/**
 * 加载任何存储的数据，优先使用最新的存储策略。 [注：跨版本兼容核心]
 * 如果上次加载是在旧版本上，则迁移数据模式。
 *
 * @returns {Promise<MetaMaskState>} 先前MetaMask实例发出的最后数据。
 */

/**
 * 加载持久化存储的状态数据，并进行版本迁移。 [注：数据迁移核心逻辑]
 * 如果启用WITH_STATE，会合并测试用例生成的状态。
 * 迁移后将元数据写入持久化管理器，并返回迁移后的数据。
 *
 * @returns {Promise<MetaMaskState>} 返回迁移后的状态数据
 */
export async function loadStateFromPersistence() {
  // 迁移
  migrator.on('error', console.warn); // 监听迁移错误 [注：记录警告信息]

  if (process.env.WITH_STATE) {
    const stateOverrides = await generateWalletState(); // 生成测试钱包状态 [注：测试环境数据注入]
    firstTimeState = { ...firstTimeState, ...stateOverrides }; // 合并初始状态 [注：覆盖默认模板]
  }

  // 从磁盘读取
  // 首先从首选的异步API：
  const preMigrationVersionedData =
    (await persistenceManager.get()) ||
    migrator.generateInitialState(firstTimeState); // 获取迁移前数据 [注：不存在时生成初始状态]

  // 向Sentry报告迁移错误
  migrator.on('error', (err) => {
    // 获取无秘密的钱包结构
    const vaultStructure = getObjStructure(preMigrationVersionedData);
    sentry.captureException(err, {
      // Sentry需要"extra"键
      extra: { vaultStructure }, // 附加数据结构信息 [注：帮助错误定位]
    });
  });

  // 迁移数据
  const versionedData = await migrator.migrateData(preMigrationVersionedData);
  if (!versionedData) {
    throw new Error('MetaMask - migrator returned undefined'); // 处理未定义结果 [注：严重错误]
  } else if (!isObject(versionedData.meta)) {
    throw new Error(
      `MetaMask - migrator metadata has invalid type '${typeof versionedData.meta}'`, // 元数据类型校验 [注：确保数据有效性]
    );
  } else if (typeof versionedData.meta.version !== 'number') {
    throw new Error(
      `MetaMask - migrator metadata version has invalid type '${typeof versionedData
        .meta.version}'`,
    );
  } else if (!isObject(versionedData.data)) {
    throw new Error(
      `MetaMask - migrator data has invalid type '${typeof versionedData.data}'`,
    );
  }
  // 这将元数据/版本数据初始化为类变量，供未来写入使用
  persistenceManager.setMetadata(versionedData.meta); // 设置元数据 [注：记录迁移版本]

  // 写入磁盘
  persistenceManager.set(versionedData.data); // 保存迁移后状态 [注：更新持久化存储]

  // 仅返回数据
  return versionedData;
}

/**
 * 发送DappViewed事件， [注：用户行为统计]
 * 仅在用户选择加入指标并连接到Dapp后跟踪。
 *
 * @param {string} origin - 访问的Dapp的URL
 */
function emitDappViewedMetricEvent(origin) {
  const { metaMetricsId } = controller.metaMetricsController.state;
  if (!shouldEmitDappViewedEvent(metaMetricsId)) {
    return; // 用户未启用指标时跳过 [注：隐私保护]
  }

  const numberOfConnectedAccounts =
    controller.getPermittedAccounts(origin).length; // 获取连接的账户数 [注：权限系统查询]
  if (numberOfConnectedAccounts === 0) {
    return; // 无连接账户时跳过 [注：仅跟踪有交互的DApp]
  }

  const preferencesState = controller.controllerMessenger.call(
    'PreferencesController:getState',
  );
  const numberOfTotalAccounts = Object.keys(preferencesState.identities).length; // 获取总账户数 [注：用户账户统计]

  controller.metaMetricsController.trackEvent({
    event: MetaMetricsEventName.DappViewed,
    category: MetaMetricsEventCategory.InpageProvider,
    referrer: {
      url: origin,
    },
    properties: {
      is_first_visit: false,
      number_of_accounts: numberOfTotalAccounts,
      number_of_accounts_connected: numberOfConnectedAccounts,
    },
  }); // 记录DApp访问事件 [注：分析用户与DApp交互]
}

/**
 * 当Dapp加载并获得权限时跟踪连接。 [注：实时监控DApp连接状态]
 *
 * @param {Port} remotePort - 新上下文提供的端口。
 */
function trackDappView(remotePort) {
  if (!remotePort.sender || !remotePort.sender.tab || !remotePort.sender.url) {
    return; // 无效发送者时跳过 [注：防御性编程]
  }
  const tabId = remotePort.sender.tab.id;
  const url = new URL(remotePort.sender.url);
  const { origin } = url; // 提取DApp原点 [注：唯一标识DApp]

  // 将原点存储到对应的标签页，以便为onActivated监听器提供信息
  if (!Object.keys(tabOriginMapping).includes(tabId)) {
    tabOriginMapping[tabId] = origin; // 建立标签页与原点的映射 [注：跟踪标签页关联的DApp]
  }

  const isConnectedToDapp = controller.controllerMessenger.call(
    'PermissionController:hasPermissions',
    origin,
  ); // 检查是否有权限 [注：权限系统查询]

  // 打开新标签页时，此事件会触发两次，仅第二次是Dapp加载完成
  const isTabLoaded = remotePort.sender.tab.title !== 'New Tab'; // 判断标签页是否加载完成 [注：排除新标签页]

  // *** 发送DappViewed指标事件当 ***
  // - 刷新Dapp
  // - 在新标签页打开Dapp
  if (isConnectedToDapp && isTabLoaded) {
    emitDappViewedMetricEvent(origin); // 触发统计事件 [注：符合条件时记录]
  }
}

/**
 * 发送App Opened事件 [注：应用启动统计]
 */
function emitAppOpenedMetricEvent() {
  const { metaMetricsId, participateInMetaMetrics } =
    controller.metaMetricsController.state;

  // 用户未选择加入指标时跳过
  if (metaMetricsId === null && !participateInMetaMetrics) {
    return; // 尊重用户隐私设置 [注：未授权时不记录]
  }

  controller.metaMetricsController.trackEvent({
    event: MetaMetricsEventName.AppOpened,
    category: MetaMetricsEventCategory.App,
  }); // 记录应用打开事件 [注：分析用户活跃度]
}

/**
 * 此函数检查应用是否正在打开， [注：避免重复记录事件]
 * 并仅在当前没有其他UI实例打开时发出事件。
 *
 * @param {string} environment - 应用打开的环境类型
 */
function trackAppOpened(environment) {
  // 要跟踪的有效环境类型列表
  const environmentTypeList = [
    ENVIRONMENT_TYPE_POPUP,
    ENVIRONMENT_TYPE_NOTIFICATION,
    ENVIRONMENT_TYPE_FULLSCREEN,
  ]; // 支持的环境类型 [注：扩展的三种UI形态]

  // 检查是否有任何UI实例当前打开
  const isFullscreenOpen = Object.values(openMetamaskTabsIDs).some(Boolean);
  const isAlreadyOpen =
    isFullscreenOpen || notificationIsOpen || openPopupCount > 0; // 多实例检查 [注：确保首次打开时记录]

  // 仅在无UI打开且环境有效时发出事件
  if (!isAlreadyOpen && environmentTypeList.includes(environment)) {
    emitAppOpenedMetricEvent(); // 触发应用打开事件 [注：首次打开时统计]
  }
}

/**
 * 初始化MetaMask控制器，配置平台相关参数、通知、持久化、事件订阅等。 [注：控制器核心配置]
 * 负责设置与UI、内容脚本、外部扩展的通信通道。
 * 负责徽章（badge）更新、通知管理、特性开关等。
 *
 * @param {object} initState - 初始状态 [注：来自持久化存储或默认模板]
 * @param {string} initLangCode - 用户首选语言 [注：用于界面语言设置]
 * @param {object} overrides - 测试用覆盖项 [注：替换依赖实现]
 * @param isFirstMetaMaskControllerSetup - 是否首次初始化 [注：避免重复初始化]
 * @param {object} stateMetadata - 状态元数据 [注：包含迁移版本]
 * @param {Promise<void>} offscreenPromise - MV3下的offscreen初始化promise [注：离线文档初始化]
 * @param {Array} preinstalledSnaps - 预装的snaps [注：第三方扩展列表]
 */
export function setupController(
  initState,
  initLangCode,
  overrides,
  isFirstMetaMaskControllerSetup,
  stateMetadata,
  offscreenPromise,
  preinstalledSnaps,
) {
  //
  // MetaMask Controller
  //
  controller = new MetamaskController({
    infuraProjectId: process.env.INFURA_PROJECT_ID, // Infura项目ID [注：以太坊节点配置]
    // 用户确认回调：
    showUserConfirmation: triggerUi, // 触发UI确认 [注：打开Popup让用户处理]
    // 初始状态
    initState,
    // 初始区域代码
    initLangCode,
    // 平台特定API
    platform,
    notificationManager,
    browser,
    getRequestAccountTabIds: () => {
      return requestAccountTabIds; // 获取请求账户的标签页ID [注：权限请求跟踪]
    },
    getOpenMetamaskTabsIds: () => {
      return openMetamaskTabsIDs; // 获取打开的MetaMask标签页ID [注：多标签管理]
    },
    persistenceManager, // 注入持久化管理器 [注：状态存储依赖]
    overrides, // 注入覆盖项 [注：测试环境依赖替换]
    isFirstMetaMaskControllerSetup, // 首次初始化标记 [注：控制器内部配置]
    currentMigrationVersion: stateMetadata.version, // 当前迁移版本 [注：数据兼容性处理]
    featureFlags: {}, // 特性标志 [注：实验功能开关]
    offscreenPromise, // 离线文档Promise [注：MV3功能支持]
    preinstalledSnaps, // 注入预装Snaps [注：扩展生态初始化]
  });

  setupEnsIpfsResolver({
    // 配置ENS/IPFS解析器 [注：去中心化域名解析]
    getCurrentChainId: () =>
      getCurrentChainId({ metamask: controller.networkController.state }),
    getIpfsGateway: controller.preferencesController.getIpfsGateway.bind(
      controller.preferencesController,
    ),
    getUseAddressBarEnsResolution: () =>
      controller.preferencesController.state.useAddressBarEnsResolution,
    provider: controller.provider,
  });

  // 设置状态持久化
  pipeline(
    storeAsStream(controller.store), // 将状态转换为流 [注：响应式状态管理]
    debounce(1000), // 去重处理 [注：避免频繁写入]
    createStreamSink(async (state) => {
      await persistenceManager.set(state); // 写入持久化存储 [注：异步保存状态]
      statePersistenceEvents.emit('state-persisted', state); // 发出持久化事件 [注：通知监听器]
    }),
    (error) => {
      log.error('MetaMask - Persistence pipeline failed', error); // 记录持久化错误 [注：关键功能监控]
    },
  );

  setupSentryGetStateGlobal(controller); // 配置Sentry全局状态钩子 [注：错误监控增强]

  const isClientOpenStatus = () => {
    return (
      openPopupCount > 0 || // Popup打开计数 [注：UI状态判断]
      Boolean(Object.keys(openMetamaskTabsIDs).length) || // 全屏标签页计数 [注：多标签状态判断]
      notificationIsOpen // 通知窗口状态 [注：通知界面状态判断]
    );
  };

  const onCloseEnvironmentInstances = (isClientOpen, environmentType) => {
    // 如果所有MetaMask实例都关闭，调用控制器方法停止gasFeeController轮询
    if (isClientOpen === false) {
      controller.onClientClosed(); // 客户端关闭处理 [注：停止后台轮询]
      // 否则我们只想移除已关闭环境类型的轮询令牌
    } else {
      // 对于全屏环境，用户可能打开多个标签页，因此除非所有标签页关闭，否则不想断开所有对应的轮询令牌。
      if (
        environmentType === ENVIRONMENT_TYPE_FULLSCREEN &&
        Boolean(Object.keys(openMetamaskTabsIDs).length)
      ) {
        return; // 多标签时不处理 [注：避免误判全屏模式状态]
      }
      controller.onEnvironmentTypeClosed(environmentType); // 环境类型关闭处理 [注：释放对应资源]
    }
  };

  /**
   * 浏览器提供的runtime.Port对象：
   *
   * @see https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/runtime/Port
   * @typedef Port
   * @type Object
   */

  /**
   * 通过多路复用双工流将Port连接到MetaMask控制器。 [注：通信核心逻辑]
   * 此方法识别可信（MetaMask）接口，并与不可信（网页）接口不同地连接它们。
   *
   * @param {Port} remotePort - 新上下文提供的端口。
   */
  connectRemote = async (remotePort) => {
    const processName = remotePort.name;

    if (metamaskBlockedPorts.includes(remotePort.name)) {
      return; // 阻塞端口时跳过 [注：安全策略]
    }

    let isMetaMaskInternalProcess = false;
    const senderUrl = remotePort.sender?.url
      ? new URL(remotePort.sender.url)
      : null; // 发送者URL解析 [注：判断是否为内部进程]

    if (isFirefox) {
      isMetaMaskInternalProcess = metamaskInternalProcessHash[processName]; // Firefox下通过名称判断 [注：浏览器差异处理]
    } else {
      isMetaMaskInternalProcess =
        senderUrl?.origin === `chrome-extension://${browser.runtime.id}`; // Chrome下通过扩展原点判断 [注：可信来源校验]
    }

    if (isMetaMaskInternalProcess) {
      const portStream =
        overrides?.getPortStream?.(remotePort) || new PortStream(remotePort); // 创建端口流 [注：内部通信通道]
      // 与Popup通信
      controller.isClientOpen = true;
      controller.setupTrustedCommunication(portStream, remotePort.sender); // 设置可信通信 [注：内部接口特权]
      trackAppOpened(processName); // 跟踪应用打开事件 [注：UI初始化统计]

      initializeRemoteFeatureFlags(); // 初始化远程特性标志 [注：获取最新功能开关]

      if (processName === ENVIRONMENT_TYPE_POPUP) {
        openPopupCount += 1; // Popup计数增加 [注：跟踪打开次数]
        finished(portStream, () => {
          openPopupCount -= 1; // Popup关闭计数减少 [注：流结束时触发]
          const isClientOpen = isClientOpenStatus();
          controller.isClientOpen = isClientOpen;
          onCloseEnvironmentInstances(isClientOpen, ENVIRONMENT_TYPE_POPUP); // 处理环境关闭 [注：释放Popup资源]
        });
      }

      if (processName === ENVIRONMENT_TYPE_NOTIFICATION) {
        notificationIsOpen = true; // 通知窗口打开 [注：状态标记]

        finished(portStream, () => {
          notificationIsOpen = false; // 通知窗口关闭 [注：流结束时更新状态]
          const isClientOpen = isClientOpenStatus();
          controller.isClientOpen = isClientOpen;
          onCloseEnvironmentInstances(
            isClientOpen,
            ENVIRONMENT_TYPE_NOTIFICATION, // 处理通知关闭 [注：释放通知资源]
          );
        });
      }

      if (processName === ENVIRONMENT_TYPE_FULLSCREEN) {
        const tabId = remotePort.sender.tab.id;
        openMetamaskTabsIDs[tabId] = true; // 记录全屏标签页 [注：多标签管理]

        finished(portStream, () => {
          delete openMetamaskTabsIDs[tabId]; // 移除全屏标签页记录 [注：标签页关闭时清理]
          const isClientOpen = isClientOpenStatus();
          controller.isClientOpen = isClientOpen;
          onCloseEnvironmentInstances(
            isClientOpen,
            ENVIRONMENT_TYPE_FULLSCREEN, // 处理全屏关闭 [注：释放全屏资源]
          );
        });
      }
    } else if (
      senderUrl &&
      senderUrl.origin === phishingPageUrl.origin &&
      senderUrl.pathname === phishingPageUrl.pathname
    ) {
      const portStreamForPhishingPage =
        overrides?.getPortStream?.(remotePort) || new PortStream(remotePort); // 创建钓鱼页通信流 [注：安全页面专用通道]
      controller.setupPhishingCommunication({
        connectionStream: portStreamForPhishingPage,
      }); // 设置钓鱼页通信 [注：接收用户在钓鱼页的操作]
    } else {
      // 新标签页打开或原点(url)改变时触发
      if (remotePort.sender && remotePort.sender.tab && remotePort.sender.url) {
        const tabId = remotePort.sender.tab.id;
        const url = new URL(remotePort.sender.url);
        const { origin } = url; // 提取DApp原点 [注：用于权限和统计]

        trackDappView(remotePort); // 跟踪DApp视图 [注：触发统计事件]

        remotePort.onMessage.addListener((msg) => {
          if (
            msg.data &&
            msg.data.method === MESSAGE_TYPE.ETH_REQUEST_ACCOUNTS
          ) {
            requestAccountTabIds[origin] = tabId; // 记录请求账户的标签页 [注：权限请求跟踪]
          }
        });
      }
      if (
        senderUrl &&
        COOKIE_ID_MARKETING_WHITELIST_ORIGINS.some(
          (origin) => origin === senderUrl.origin,
        )
      ) {
        const portStreamForCookieHandlerPage =
          overrides?.getPortStream?.(remotePort) || new PortStream(remotePort); // 创建Cookie处理流 [注：白名单域名专用通道]
        controller.setUpCookieHandlerCommunication({
          connectionStream: portStreamForCookieHandlerPage,
        }); // 设置Cookie处理通信 [注：允许白名单域名交互]
      }
      connectExternalExtension(remotePort); // 连接外部扩展 [注：不可信通信处理]
    }
  };

  // 与页面或其他扩展通信
  connectExternalExtension = (remotePort) => {
    const portStream =
      overrides?.getPortStream?.(remotePort) || new PortStream(remotePort); // 创建外部通信流 [注：遵循EIP-1193标准]
    controller.setupUntrustedCommunicationEip1193({
      connectionStream: portStream,
      sender: remotePort.sender,
    }); // 设置不可信通信 [注：外部DApp通信安全处理]
  };

  connectExternalCaip = async (remotePort) => {
    if (!process.env.MULTICHAIN_API) {
      return; // 未启用多链API时跳过 [注：功能开关控制]
    }

    if (metamaskBlockedPorts.includes(remotePort.name)) {
      return; // 阻塞端口时跳过 [注：安全策略]
    }

    // 新标签页打开或原点(url)改变时触发
    if (remotePort.sender && remotePort.sender.tab && remotePort.sender.url) {
      trackDappView(remotePort); // 跟踪DApp视图 [注：多链DApp支持]
    }

    const portStream =
      overrides?.getPortStream?.(remotePort) || new PortStream(remotePort); // 创建CAIP通信流 [注：支持CAIP-26标准]

    controller.setupUntrustedCommunicationCaip({
      connectionStream: portStream,
      sender: remotePort.sender,
    }); // 设置不可信CAIP通信 [注：多链环境下的通信处理]
  };

  if (overrides?.registerConnectListeners) {
    overrides.registerConnectListeners(connectRemote, connectExternalExtension); // 注册连接监听器 [注：测试环境扩展]
  }

  //
  // 用户界面设置
  //
  updateBadge(); // 初始化徽章 [注：设置初始显示]

  controller.controllerMessenger.subscribe(
    METAMASK_CONTROLLER_EVENTS.DECRYPT_MESSAGE_MANAGER_UPDATE_BADGE,
    updateBadge, // 订阅解密消息更新 [注：实时刷新徽章]
  );
  controller.controllerMessenger.subscribe(
    METAMASK_CONTROLLER_EVENTS.ENCRYPTION_PUBLIC_KEY_MANAGER_UPDATE_BADGE,
    updateBadge, // 订阅加密公钥更新 [注：实时刷新徽章]
  );
  controller.signatureController.hub.on(
    METAMASK_CONTROLLER_EVENTS.UPDATE_BADGE,
    updateBadge, // 订阅签名更新 [注：实时刷新徽章]
  );
  controller.controllerMessenger.subscribe(
    METAMASK_CONTROLLER_EVENTS.APP_STATE_UNLOCK_CHANGE,
    updateBadge, // 订阅解锁状态变化 [注：实时刷新徽章]
  );

  controller.controllerMessenger.subscribe(
    METAMASK_CONTROLLER_EVENTS.APPROVAL_STATE_CHANGE,
    updateBadge, // 订阅批准状态变化 [注：实时刷新徽章]
  );

  controller.controllerMessenger.subscribe(
    METAMASK_CONTROLLER_EVENTS.METAMASK_NOTIFICATIONS_LIST_UPDATED,
    updateBadge, // 订阅通知列表更新 [注：实时刷新徽章]
  );

  controller.controllerMessenger.subscribe(
    METAMASK_CONTROLLER_EVENTS.METAMASK_NOTIFICATIONS_MARK_AS_READ,
    updateBadge, // 订阅通知已读标记 [注：实时刷新徽章]
  );

  /**
   * 格式化计数以显示为徽章标签。 [注：用户界面组件]
   *
   * @param {number} count - 要格式化的计数。
   * @param {number} maxCount - 使用'+'后缀前的最大显示计数。
   * @returns {string} 格式化后的徽章标签。
   */
  function getBadgeLabel(count, maxCount) {
    return count > maxCount ? `${maxCount}+` : String(count); // 超过最大值显示为9+ [注：用户体验优化]
  }

  /**
   * 更新浏览器扩展的"徽章"数字，位于工具栏的小狐狸上。 [注：关键用户通知]
   * 数字反映需要用户批准的待处理交易或消息签名的当前数量。
   */
  function updateBadge() {
    const pendingApprovalCount = getPendingApprovalCount(); // 获取待批准计数 [注：权限请求统计]
    const unreadNotificationsCount = getUnreadNotificationsCount(); // 获取未读通知计数 [注：通知系统统计]

    let label = '';
    let badgeColor = BADGE_COLOR_APPROVAL; // 默认审批颜色 [注：蓝色表示待处理]

    if (pendingApprovalCount) {
      label = getBadgeLabel(pendingApprovalCount, BADGE_MAX_COUNT); // 待批准时显示计数 [注：用户交互提示]
    } else if (unreadNotificationsCount > 0) {
      label = getBadgeLabel(unreadNotificationsCount, BADGE_MAX_COUNT); // 未读通知时显示计数 [注：红色提示]
      badgeColor = BADGE_COLOR_NOTIFICATION; // 切换为通知颜色 [注：视觉区分]
    }

    try {
      const badgeText = { text: label };
      const badgeBackgroundColor = { color: badgeColor }; // 设置徽章样式 [注：浏览器API调用]

      if (isManifestV3) {
        browser.action.setBadgeText(badgeText);
        browser.action.setBadgeBackgroundColor(badgeBackgroundColor); // MV3设置方式 [注：新版本API]
      } else {
        browser.browserAction.setBadgeText(badgeText);
        browser.browserAction.setBadgeBackgroundColor(badgeBackgroundColor); // MV2设置方式 [注：旧版本兼容]
      }
    } catch (error) {
      console.error('Error updating browser badge:', error); // 记录徽章更新错误 [注：界面功能监控]
    }
  }

  /**
   * 通过请求从clientConfigApi获取远程特性标志来初始化它们。 [注：动态功能开关]
   * 此函数在MM处于内部进程时调用。
   * 如果请求失败，错误将被记录但不会中断扩展初始化。
   *
   * @returns {Promise<void>} 远程特性标志更新完成时解析的Promise。
   */
  async function initializeRemoteFeatureFlags() {
    try {
      // 初始化获取远程特性标志的请求
      await controller.remoteFeatureFlagController.updateRemoteFeatureFlags(); // 远程获取特性标志 [注：动态配置]
    } catch (error) {
      log.error('Error initializing remote feature flags:', error); // 记录初始化错误 [注：不影响主流程]
    }
  }

  function getPendingApprovalCount() {
    try {
      const pendingApprovalCount =
        controller.appStateController.waitingForUnlock.length + // 等待解锁的请求 [注：安全状态相关]
        controller.approvalController.getTotalApprovalCount(); // 待批准的总请求 [注：权限系统统计]
      return pendingApprovalCount;
    } catch (error) {
      console.error('Failed to get pending approval count:', error); // 记录获取错误 [注：防御性编程]
      return 0;
    }
  }

  function getUnreadNotificationsCount() {
    try {
      const { isNotificationServicesEnabled, isFeatureAnnouncementsEnabled } =
        controller.notificationServicesController.state; // 获取通知服务状态 [注：功能开关]

      const snapNotificationCount = Object.values(
        controller.notificationServicesController.state
          .metamaskNotificationsList,
      ).filter(
        (notification) =>
          notification.type ===
            NotificationServicesController.Constants.TRIGGER_TYPES.SNAP && // Snap通知过滤 [注：第三方扩展通知]
          notification.readDate === null,
      ).length;

      const featureAnnouncementCount = isFeatureAnnouncementsEnabled
        ? controller.notificationServicesController.state.metamaskNotificationsList.filter(
            (notification) =>
              !notification.isRead && // 未读过滤 [注：新功能通知]
              notification.type ===
                NotificationServicesController.Constants.TRIGGER_TYPES
                  .FEATURES_ANNOUNCEMENT,
          ).length
        : 0;

      const walletNotificationCount = isNotificationServicesEnabled
        ? controller.notificationServicesController.state.metamaskNotificationsList.filter(
            (notification) =>
              !notification.isRead && // 未读过滤 [注：钱包相关通知]
              notification.type !==
                NotificationServicesController.Constants.TRIGGER_TYPES
                  .FEATURES_ANNOUNCEMENT &&
              notification.type !==
                NotificationServicesController.Constants.TRIGGER_TYPES.SNAP,
          ).length
        : 0;

      const unreadNotificationsCount =
        snapNotificationCount + // 汇总各类未读通知 [注：多类型通知统计]
        featureAnnouncementCount +
        walletNotificationCount;

      return unreadNotificationsCount;
    } catch (error) {
      console.error('Failed to get unread notifications count:', error); // 记录获取错误 [注：防御性编程]
      return 0;
    }
  }

  notificationManager.on(
    NOTIFICATION_MANAGER_EVENTS.POPUP_CLOSED,
    ({ automaticallyClosed }) => {
      if (!automaticallyClosed) {
        rejectUnapprovedNotifications(); // 手动关闭时拒绝未批准通知 [注：安全处理]
      } else if (getPendingApprovalCount() > 0) {
        triggerUi(); // 自动关闭但仍有待批准请求时重新触发UI [注：用户交互引导]
      }

      updateBadge(); // 关闭后刷新徽章 [注：状态同步]
    },
  );

  function rejectUnapprovedNotifications() {
    controller.signatureController.rejectUnapproved(
      REJECT_NOTIFICATION_CLOSE_SIG, // 拒绝未批准的签名请求 [注：批量操作]
    );
    controller.decryptMessageController.rejectUnapproved(
      REJECT_NOTIFICATION_CLOSE, // 拒绝未批准的解密请求 [注：批量操作]
    );
    controller.encryptionPublicKeyController.rejectUnapproved(
      REJECT_NOTIFICATION_CLOSE, // 拒绝未批准的加密公钥请求 [注：批量操作]
    );

    controller.rejectAllPendingApprovals(); // 拒绝所有待批准请求 [注：安全策略]
  }

  // 如果用户安装了至少一个非预装的snap，更新snap注册表并检查新阻止的snap以进行阻止。
  if (
    Object.values(controller.snapController.state.snaps).some(
      (snap) => !snap.preinstalled, // 检查是否有非预装Snap [注：第三方扩展管理]
    )
  ) {
    controller.snapController.updateBlockedSnaps(); // 更新阻止的Snaps [注：安全扫描]
  }
}

//
// 其他...
//

/**
 * 打开浏览器Popup供用户确认 [注：核心交互入口]
 */
async function triggerUi() {
  const tabs = await platform.getActiveTabs(); // 获取活动标签页 [注：判断当前状态]
  const currentlyActiveMetamaskTab = Boolean(
    tabs.find((tab) => openMetamaskTabsIDs[tab.id]), // 检查是否有活动的MetaMask标签页 [注：避免重复打开]
  );
  // Vivaldi在Popup关闭时不关闭端口连接，因此openPopupCount无法正确工作
  // 未来如果此行为修复则需要重新审视 - 同时我们确定isVivaldi变量的方式可能会在某个时候改变
  const isVivaldi =
    tabs.length > 0 &&
    tabs[0].extData &&
    tabs[0].extData.indexOf('vivaldi_tab') > -1; // 检测Vivaldi浏览器 [注：浏览器兼容性处理]
  if (
    !uiIsTriggering && // 非触发状态 [注：防止并发]
    (isVivaldi || openPopupCount === 0) && // Vivaldi特殊处理或无Popup打开 [注：条件判断]
    !currentlyActiveMetamaskTab // 无活动标签页 [注：用户交互引导]
  ) {
    uiIsTriggering = true;
    try {
      const currentPopupId = controller.appStateController.getCurrentPopupId();
      await notificationManager.showPopup(
        (newPopupId) =>
          controller.appStateController.setCurrentPopupId(newPopupId), // 设置当前Popup ID [注：管理多个Popup实例]
        currentPopupId,
      );
    } finally {
      uiIsTriggering = false; // 重置触发状态 [注：确保单次触发]
    }
  }
}

// 将"App Installed"事件添加到事件队列，仅在用户选择加入指标后跟踪。
const addAppInstalledEvent = () => {
  if (controller) {
    controller.metaMetricsController.updateTraits({
      [MetaMetricsUserTrait.InstallDateExt]: new Date()
        .toISOString()
        .split('T')[0], // yyyy-mm-dd [注：记录安装日期]
    });
    controller.metaMetricsController.addEventBeforeMetricsOptIn({
      category: MetaMetricsEventCategory.App,
      event: MetaMetricsEventName.AppInstalled,
      properties: {},
    }); // 添加安装事件 [注：用户转化统计]
    return;
  }
  setTimeout(() => {
    // 控制器未设置时，等待并重试
    addAppInstalledEvent(); // 重试机制 [注：确保事件记录]
  }, 500);
};

/**
 * 触发仅在首次安装时发生的操作（如打开引导标签页）。 [注：新用户引导]
 */
function onInstall() {
  log.debug('First install detected'); // 记录首次安装 [注：调试日志]
  addAppInstalledEvent(); // 添加安装事件 [注：统计上报]
  if (!process.env.IN_TEST && !process.env.METAMASK_DEBUG) {
    platform.openExtensionInBrowser(); // 打开扩展页面 [注：引导用户配置]
  }
}

function onNavigateToTab() {
  browser.tabs.onActivated.addListener((onActivatedTab) => {
    if (controller) {
      const { tabId } = onActivatedTab;
      const currentOrigin = tabOriginMapping[tabId]; // 获取标签页关联的原点 [注：DApp跟踪]
      // *** 发送DappViewed指标事件当 ***
      // - 导航到已连接的Dapp
      if (currentOrigin) {
        const connectSitePermissions =
          controller.permissionController.state.subjects[currentOrigin]; // 获取站点权限 [注：判断连接状态]
        // 当Dapp未连接时，connectSitePermissions为undefined
        const isConnectedToDapp = connectSitePermissions !== undefined;
        if (isConnectedToDapp) {
          emitDappViewedMetricEvent(currentOrigin); // 触发统计事件 [注：用户行为跟踪]
        }
      }
    }
  });
}

function setupSentryGetStateGlobal(store) {
  global.stateHooks.getSentryAppState = function () {
    const backgroundState = store.memStore.getState();
    return maskObject(backgroundState, SENTRY_BACKGROUND_STATE); // 掩码敏感数据 [注：安全上报状态]
  };
}

/**
 * 初始化MetaMask后台主进程。 [注：启动入口]
 * 负责监听页面切换事件，并启动主初始化流程。
 * 如果处于测试环境，初始化完成后会通知offscreen文档或设置页面标记。
 * 初始化完成后会清理最近一次持久化的状态。
 */
async function initBackground() {
  onNavigateToTab();
  try {
    await initialize();
    if (process.env.IN_TEST) {
      // 如果在测试环境，通知 offscreen 文档后台已准备好，或设置页面标记
      // Send message to offscreen document
      if (browser.offscreen) {
        browser.runtime.sendMessage({
          target: OffscreenCommunicationTarget.extension,
          event: OffscreenCommunicationEvents.metamaskBackgroundReady,
        });
      } else {
        window.document?.documentElement?.classList.add('controller-loaded');
      }
    }
    // 清理最近一次持久化的状态，避免脏数据影响后续流程
    persistenceManager.cleanUpMostRecentRetrievedState();
  } catch (error) {
    log.error(error);
  }
}
if (!process.env.SKIP_BACKGROUND_INITIALIZATION) {
  initBackground();
}

// initBackground()
//   └─ initialize()
//       ├─ loadStateFromPersistence()
//       ├─ setupController(...)
//       ├─ maybeDetectPhishing(controller)
//       ├─ loadPhishingWarningPage()
//       └─ sendReadyMessageToTabs()
