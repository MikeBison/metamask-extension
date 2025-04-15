// 确保我们不受重叠命名空间的影响
// 并且我们的命名空间不会影响应用程序
// 主要是为了修复 web3 的 BigNumber，如果 AMD 的 "define" 已定义的情况...
let __define;

/**
 * 缓存全局 define 对象的引用并删除它，
 * 以避免与其他全局 define 对象冲突，
 * 例如 AMD 的 define 函数
 */
const cleanContextForImports = () => {
  __define = global.define;
  try {
    global.define = undefined;
  } catch (_) {
    console.warn('MetaMask - global.define 无法被删除。');
  }
};

/**
 * 从缓存的引用中恢复全局 define 对象
 */
const restoreContextAfterImports = () => {
  try {
    global.define = __define;
  } catch (_) {
    console.warn('MetaMask - global.define 无法被覆盖。');
  }
};

// 在导入前清理上下文环境
cleanContextForImports();

/* eslint-disable import/first */
import log from 'loglevel';
import { v4 as uuid } from 'uuid';
import { WindowPostMessageStream } from '@metamask/post-message-stream';
import { initializeProvider } from '@metamask/providers/initializeInpageProvider';

// 这目前等同于 process.env.MULTICHAIN_API
// 不能用于条件导入
///: BEGIN:ONLY_INCLUDE_IF(build-beta,build-flask)
import {
  getMultichainClient,
  getDefaultTransport,
} from '@metamask/multichain-api-client';
import { registerSolanaWalletStandard } from '@metamask/solana-wallet-standard';
///: END:ONLY_INCLUDE_IF

import shouldInjectProvider from '../../shared/modules/provider-injection';

// 上下文定义
const CONTENT_SCRIPT = 'metamask-contentscript'; // 内容脚本标识
const INPAGE = 'metamask-inpage'; // 页内脚本标识

// 恢复导入后的上下文环境
restoreContextAfterImports();

// 设置日志级别，如果开启调试模式则为 debug，否则为 warn
log.setDefaultLevel(process.env.METAMASK_DEBUG ? 'debug' : 'warn');

//
// 设置插件通信
//

// 检查是否应该注入 provider
if (shouldInjectProvider()) {
  // 设置与后台的连接
  const metamaskStream = new WindowPostMessageStream({
    name: INPAGE, // 当前脚本标识
    target: CONTENT_SCRIPT, // 目标脚本标识
  });

  // 初始化 provider
  initializeProvider({
    connectionStream: metamaskStream, // 通信流
    logger: log, // 日志工具
    shouldShimWeb3: true, // 是否应该兼容 web3
    providerInfo: {
      uuid: uuid(), // 生成唯一标识
      name: process.env.METAMASK_BUILD_NAME, // MetaMask 构建名称
      icon: process.env.METAMASK_BUILD_ICON, // MetaMask 图标
      rdns: process.env.METAMASK_BUILD_APP_ID, // 反向域名标识
    },
  });

  // 这目前等同于 process.env.MULTICHAIN_API
  ///: BEGIN:ONLY_INCLUDE_IF(build-beta,build-flask)
  // 仅在 beta 和 flask 构建版本中初始化多链客户端
  getMultichainClient({
    transport: getDefaultTransport(),
  }).then((client) => {
    // 注册 Solana 钱包标准
    registerSolanaWalletStandard({ client });
  });
  ///: END:ONLY_INCLUDE_IF
}
