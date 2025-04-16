import browser from 'webextension-polyfill';

import { getBlockExplorerLink } from '@metamask/etherscan-link';
import { startCase, toLower } from 'lodash';
import { TransactionStatus } from '@metamask/transaction-controller';
import { getEnvironmentType } from '../lib/util';
import { ENVIRONMENT_TYPE_BACKGROUND } from '../../../shared/constants/app';
// TODO: 移除受限导入
// eslint-disable-next-line import/no-restricted-paths
import { getURLHostName } from '../../../ui/helpers/utils/util';
import { t } from '../translate';

// 导出默认的 ExtensionPlatform 类，该类封装了与浏览器扩展平台交互的方法
export default class ExtensionPlatform {
  //
  // 公共方法
  //
  // 重新加载扩展
  reload() {
    browser.runtime.reload();
  }

  // 异步方法，用于在浏览器中打开一个新标签页
  // 参数 options 是一个对象，包含了创建新标签页所需的配置
  async openTab(options) {
    const newTab = await browser.tabs.create(options);
    return newTab;
  }

  // 异步方法，用于在浏览器中打开一个新窗口
  // 参数 options 是一个对象，包含了创建新窗口所需的配置
  async openWindow(options) {
    const newWindow = await browser.windows.create(options);
    return newWindow;
  }

  // 异步方法，用于将指定 ID 的窗口设置为焦点窗口
  // 参数 windowId 是要设置为焦点的窗口的 ID
  async focusWindow(windowId) {
    await browser.windows.update(windowId, { focused: true });
  }

  // 异步方法，用于更新指定 ID 窗口的位置
  // 参数 windowId 是要更新位置的窗口的 ID，left 和 top 是窗口的新位置
  async updateWindowPosition(windowId, left, top) {
    await browser.windows.update(windowId, { left, top });
  }

  // 异步方法，用于获取最后一个获得焦点的窗口对象
  async getLastFocusedWindow() {
    const windowObject = await browser.windows.getLastFocused();
    return windowObject;
  }

  // 异步方法，用于关闭当前窗口
  async closeCurrentWindow() {
    const windowDetails = await browser.windows.getCurrent();
    browser.windows.remove(windowDetails.id);
  }

  /**
   * 通过读取清单文件返回扩展的版本。
   */
  getVersion() {
    // 返回扩展的“实时”版本，因为正在运行的代码包
    // 可能来自与清单文件不同版本的应用程序。
    // 这在理论上不应该发生，但我们在 Sentry 中见过。
    // 这里 *不应该* 更新为静态的 `process.env.METAMASK_VERSION`
    return browser.runtime.getManifest().version;
  }

  // 获取扩展的 URL，可以根据传入的路由和查询字符串进行拼接
  // 参数 route 是路由路径，queryString 是查询字符串
  getExtensionURL(route = null, queryString = null) {
    let extensionURL = browser.runtime.getURL('home.html');

    if (route) {
      extensionURL += `#${route}`;
    }

    if (queryString) {
      extensionURL += `?${queryString}`;
    }

    return extensionURL;
  }

  // 在浏览器中打开扩展页面
  // 参数 route 是路由路径，queryString 是查询字符串，keepWindowOpen 表示是否保持当前窗口打开
  openExtensionInBrowser(
    route = null,
    queryString = null,
    keepWindowOpen = false,
  ) {
    const extensionURL = this.getExtensionURL(
      route,
      queryString,
      keepWindowOpen,
    );

    this.openTab({ url: extensionURL });

    if (
      getEnvironmentType() !== ENVIRONMENT_TYPE_BACKGROUND &&
      !keepWindowOpen
    ) {
      window.close();
    }
  }

  // 获取平台信息，并通过回调函数返回结果
  // 参数 cb 是一个回调函数，用于处理获取到的平台信息或错误
  getPlatformInfo(cb) {
    try {
      const platformInfo = browser.runtime.getPlatformInfo();
      cb(platformInfo);
      // eslint-disable-next-line no-useless-return
      return;
    } catch (e) {
      cb(e);
      // eslint-disable-next-line no-useless-return
      return;
    }
  }

  // 异步方法，用于显示交易通知，根据交易状态显示不同的通知信息
  // 参数 txMeta 是交易元数据，rpcPrefs 是 RPC 偏好设置
  async showTransactionNotification(txMeta, rpcPrefs) {
    const { status, txReceipt: { status: receiptStatus } = {} } = txMeta;

    if (status === TransactionStatus.confirmed) {
      // 链上交易失败
      receiptStatus === '0x0'
        ? await this._showFailedTransaction(
            txMeta,
            'Transaction encountered an error.',
          )
        : await this._showConfirmedTransaction(txMeta, rpcPrefs);
    } else if (status === TransactionStatus.failed) {
      await this._showFailedTransaction(txMeta);
    }
  }

  // 添加窗口移除事件的监听器
  // 参数 listener 是一个回调函数，当窗口被移除时会调用该函数
  addOnRemovedListener(listener) {
    browser.windows.onRemoved.addListener(listener);
  }

  // 异步方法，用于获取所有打开的窗口对象
  async getAllWindows() {
    const windows = await browser.windows.getAll();
    return windows;
  }

  // 异步方法，用于获取所有活动的标签页对象
  async getActiveTabs() {
    const tabs = await browser.tabs.query({ active: true });
    return tabs;
  }

  // 异步方法，用于获取当前标签页对象
  async currentTab() {
    const tab = await browser.tabs.getCurrent();
    return tab;
  }

  // 异步方法，用于切换到指定 ID 的标签页
  // 参数 tabId 是要切换到的标签页的 ID
  async switchToTab(tabId) {
    const tab = await browser.tabs.update(tabId, { highlighted: true });
    return tab;
  }

  // 异步方法，用于将指定 ID 的标签页切换到指定的 URL
  // 参数 tabId 是要切换的标签页的 ID，url 是要切换到的 URL
  async switchToAnotherURL(tabId, url) {
    await browser.tabs.update(tabId, { url });
  }

  // 异步方法，用于关闭指定 ID 的标签页
  // 参数 tabId 是要关闭的标签页的 ID
  async closeTab(tabId) {
    await browser.tabs.remove(tabId);
  }

  // 异步方法，用于显示交易确认通知
  // 参数 txMeta 是交易元数据，rpcPrefs 是 RPC 偏好设置
  async _showConfirmedTransaction(txMeta, rpcPrefs) {
    this._subscribeToNotificationClicked();

    const url = getBlockExplorerLink(txMeta, rpcPrefs);
    const nonce = parseInt(txMeta.txParams.nonce, 16);
    const view = startCase(
      toLower(getURLHostName(url).replace(/([.]\w+)$/u, '')),
    );

    const title = t('notificationTransactionSuccessTitle');
    let message = t('notificationTransactionSuccessMessage', nonce);

    if (url.length) {
      message += ` ${t('notificationTransactionSuccessView', view)}`;
    }

    await this._showNotification(title, message, url);
  }

  // 异步方法，用于显示交易失败通知
  // 参数 txMeta 是交易元数据，errorMessage 是错误信息
  async _showFailedTransaction(txMeta, errorMessage) {
    const nonce = parseInt(txMeta.txParams.nonce, 16);
    const title = t('notificationTransactionFailedTitle');
    let message = t(
      'notificationTransactionFailedMessage',
      nonce,
      errorMessage || txMeta.error.message,
    );
    ///: BEGIN:ONLY_INCLUDE_IF(build-mmi)
    if (isNaN(nonce)) {
      message = t(
        'notificationTransactionFailedMessageMMI',
        errorMessage || txMeta.error.message,
      );
    }
    ///: END:ONLY_INCLUDE_IF
    await this._showNotification(title, message);
  }

  // 异步方法，用于显示通知
  // 参数 title 是通知的标题，message 是通知的内容，url 是通知点击后的跳转链接
  async _showNotification(title, message, url) {
    const iconUrl = await browser.runtime.getURL('../../images/icon-64.png');

    await browser.notifications.create(url, {
      type: 'basic',
      title,
      iconUrl,
      message,
    });
  }

  // 订阅通知点击事件，当通知被点击时会触发相应的处理函数
  _subscribeToNotificationClicked() {
    if (!browser.notifications.onClicked.hasListener(this._viewOnEtherscan)) {
      browser.notifications.onClicked.addListener(this._viewOnEtherscan);
    }
  }

  // 当通知被点击时，如果链接是有效的 HTTPS 链接，则在新标签页中打开该链接
  _viewOnEtherscan(url) {
    if (url.startsWith('https://')) {
      browser.tabs.create({ url });
    }
  }
}
