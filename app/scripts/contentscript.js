// 从 '../../shared/modules/browser-runtime.utils' 模块导入 getIsBrowserPrerenderBroken 函数
// 此函数用于判断浏览器预渲染是否存在问题
import { getIsBrowserPrerenderBroken } from '../../shared/modules/browser-runtime.utils';
// 从 '../../shared/modules/provider-injection' 模块导入 shouldInjectProvider 函数
// 该函数用于判断是否应该注入提供者
import shouldInjectProvider from '../../shared/modules/provider-injection';
// 从 './streams/provider-stream' 模块导入与流操作相关的函数
// destroyStreams 用于销毁流，initStreams 用于初始化流，
// onDisconnectDestroyStreams 用于在断开连接时销毁流，setupExtensionStreams 用于设置扩展流
import {
  destroyStreams,
  initStreams,
  onDisconnectDestroyStreams,
  setupExtensionStreams,
} from './streams/provider-stream';
// 从 './streams/phishing-stream' 模块导入与钓鱼检测相关的函数
// isDetectedPhishingSite 用于检测是否为钓鱼网站，initPhishingStreams 用于初始化钓鱼检测流
import {
  isDetectedPhishingSite,
  initPhishingStreams,
} from './streams/phishing-stream';
// 从 './streams/cookie-handler-stream' 模块导入与 cookie 处理相关的函数
// initializeCookieHandlerSteam 用于初始化 cookie 处理流，
// isDetectedCookieMarketingSite 用于检测是否为 cookie 营销网站
import {
  initializeCookieHandlerSteam,
  isDetectedCookieMarketingSite,
} from './streams/cookie-handler-stream';

// 定义一个名为 start 的函数，用于启动一系列初始化和事件监听操作
const start = () => {
  // 如果检测到当前网站是钓鱼网站
  if (isDetectedPhishingSite) {
    // 初始化钓鱼检测流
    initPhishingStreams();
    // 直接返回，不再执行后续操作
    return;
  }

  // 如果检测到当前网站是 cookie 营销网站
  if (isDetectedCookieMarketingSite) {
    // 初始化 cookie 处理流
    initializeCookieHandlerSteam();
  }

  // 如果应该注入提供者
  if (shouldInjectProvider()) {
    // 初始化流
    initStreams();

    // 如果页面正在预渲染且浏览器预渲染存在问题
    if (document.prerendering && getIsBrowserPrerenderBroken()) {
      // 监听 document 的 'prerenderingchange' 事件
      document.addEventListener('prerenderingchange', () => {
        // 当预渲染状态改变时，调用 onDisconnectDestroyStreams 函数销毁流
        // 并传入一个错误对象，说明预渲染页面已变为活动状态
        onDisconnectDestroyStreams(
          new Error('Prerendered page has become active.'),
        );
      });
    }

    // 监听 window 的 'pageshow' 事件
    window.addEventListener('pageshow', (event) => {
      // 如果页面是从 bfcache 中恢复的
      if (event.persisted) {
        // 输出警告信息，提示从 bfcache 中恢复的页面已变为活动状态，正在恢复流
        console.warn('BFCached page has become active. Restoring the streams.');
        // 设置扩展流
        setupExtensionStreams();
      }
    });

    // 监听 window 的 'pagehide' 事件
    window.addEventListener('pagehide', (event) => {
      // 如果页面可能会被放入 bfcache
      if (event.persisted) {
        // 输出警告信息，提示页面可能会被放入 bfcache，正在销毁流
        console.warn('Page may become BFCached. Destroying the streams.');
        // 销毁流
        destroyStreams();
      }
    });
  }
};

// 调用 start 函数，启动整个流程
start();
