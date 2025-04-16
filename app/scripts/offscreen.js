import { captureException } from '@sentry/browser'; // 导入Sentry异常捕获工具 [注：用于上报未处理的错误]
import {
  OFFSCREEN_LOAD_TIMEOUT, // 离线文档加载超时时间常量 [注：单位为毫秒，控制最大等待时间]
  OffscreenCommunicationTarget, // 离线文档通信目标常量 [注：定义通信目标类型]
} from '../../shared/constants/offscreen-communication';
import { getSocketBackgroundToMocha } from '../../test/e2e/background-socket/socket-background-to-mocha'; // 导入测试用Socket连接工具 [注：Mocha测试框架通信接口]

/**
 * 判断离线文档是否已存在。 [注：兼容Chrome不同版本的检测逻辑]
 *
 * 参考：https://developer.chrome.com/docs/extensions/reference/api/offscreen#before_chrome_116_check_if_an_offscreen_document_is_open
 *
 * @returns 若离线文档已打开则返回True，否则返回False。
 */
async function hasOffscreenDocument() {
  const { chrome, clients } = globalThis;
  // getContexts仅在Chrome 116+可用
  if ('getContexts' in chrome.runtime) {
    // 新版本Chrome检测方式 [注：使用官方提供的上下文API]
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'], // 筛选离线文档上下文 [注：专用上下文类型]
    });
    return contexts.length > 0; // 存在有效上下文则返回true [注：直接检测API返回结果]
  }
  // 旧版本Chrome兼容逻辑
  const matchedClients = await clients.matchAll(); // 获取所有客户端实例 [注：兼容Chrome旧版本]
  const url = chrome.runtime.getURL('offscreen.html'); // 获取离线文档URL [注：固定页面路径]
  return matchedClients.some((client) => client.url === url); // 检查是否存在匹配的客户端 [注：通过URL匹配]
}

/**
 * 创建可用于加载额外脚本和iframe的离线文档，通过chrome运行时API与扩展通信。 [注：核心离线功能实现]
 * 仅允许存在一个离线文档，扩展所需的所有iframe可嵌入offscreen.html。详见offscreen文件夹。
 */
export async function createOffscreen() {
  const { chrome } = globalThis;
  if (!chrome.offscreen) {
    // 检测浏览器是否支持离线文档API [注：早期版本可能不支持]
    return;
  }

  let offscreenDocumentLoadedListener; // 监听离线文档加载完成的事件处理器
  const loadPromise = new Promise((resolve) => {
    offscreenDocumentLoadedListener = (msg) => {
      // 消息监听函数 [注：捕获离线文档的启动信号]
      if (
        msg.target === OffscreenCommunicationTarget.extensionMain && // 验证通信目标 [注：确保来自主扩展]
        msg.isBooted // 验证文档已启动 [注：自定义启动完成标志]
      ) {
        chrome.runtime.onMessage.removeListener(
          // 移除监听避免内存泄漏 [注：单次触发后清理]
          offscreenDocumentLoadedListener,
        );
        resolve(); // 解析Promise通知加载完成 [注：触发后续流程]

        // 若处于测试环境且检测到Webdriver（自动化测试工具），启动Mocha通信Socket
        if (process.env.IN_TEST && msg.webdriverPresent) {
          // 测试环境特殊处理 [注：连接测试框架]
          getSocketBackgroundToMocha();
        }
      }
    };
    chrome.runtime.onMessage.addListener(offscreenDocumentLoadedListener); // 添加消息监听 [注：等待离线文档初始化完成]
  });

  try {
    const offscreenExists = await hasOffscreenDocument(); // 检查现有离线文档 [注：避免重复创建]

    // 某些情况下启动时可能已存在离线文档，关闭后重新创建
    if (offscreenExists) {
      // 处理已有文档逻辑 [注：确保单例模式]
      console.debug('Found existing offscreen document, closing.');
      await chrome.offscreen.closeDocument(); // 关闭现有文档 [注：释放旧资源]
    }

    await chrome.offscreen.createDocument({
      // 创建新的离线文档 [注：指定核心参数]
      url: './offscreen.html', // 离线文档入口页面 [注：项目内固定路径]
      reasons: ['IFRAME_SCRIPTING'], // 创建原因 [注：允许iframe脚本执行]
      justification:
        'Used for Hardware Wallet and Snaps scripts to communicate with the extension.', // 用途说明 [注：硬件钱包和Snaps通信]
    });
  } catch (error) {
    // 异常处理 [注：非关键错误，不阻断钱包初始化]
    if (offscreenDocumentLoadedListener) {
      chrome.runtime.onMessage.removeListener(
        // 清理监听避免内存泄漏 [注：错误处理最佳实践]
        offscreenDocumentLoadedListener,
      );
    }
    // 捕获未识别的错误并上报Sentry，不中断钱包初始化
    captureException(error); // 上报错误到监控平台 [注：记录但不终止流程]
    return;
  }

  // 处理离线文档加载超时场景，避免无限阻塞
  const timeoutPromise = new Promise((resolve) => {
    // 创建超时Promise [注：设置最大等待时间]
    setTimeout(resolve, OFFSCREEN_LOAD_TIMEOUT);
  });

  await Promise.race([loadPromise, timeoutPromise]); // 等待加载完成或超时 [注：取最快完成的操作]

  console.debug('Offscreen iframe loaded'); // 日志输出 [注：指示离线文档加载完成]
}
