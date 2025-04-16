// 翻译：冻结所有内置对象
// 辅助阅读：此代码的主要目的是对 JavaScript 环境中的所有内置对象进行冻结操作。冻结操作可以防止这些内置对象被意外修改或被恶意代码篡改，从而增强代码的安全性和稳定性。

try {
  // 翻译：尝试调用 lockdown 函数，进行环境锁定
  // 辅助阅读：使用 try 块包裹对 `lockdown` 函数的调用，目的是捕获可能出现的异常。`lockdown` 函数通常来自安全库，用于对 JavaScript 环境进行严格的锁定和限制。

  // 辅助阅读：这里使用 ESLint 注释禁用了 `no-undef` 和 `import/unambiguous` 规则，因为 `lockdown` 可能是在其他地方定义或导入的，这样可以避免 ESLint 报错。
  // eslint-disable-next-line no-undef,import/unambiguous
  lockdown({
    // 翻译：控制台对象的处理方式为不安全模式
    // 辅助阅读：`consoleTaming` 是 `lockdown` 函数配置项之一，设置为 `'unsafe'` 意味着对 `console` 对象不进行严格的锁定和限制，允许代码正常使用 `console` 对象的各种方法，如 `console.log` 等。
    consoleTaming: 'unsafe',
    // 翻译：错误对象的处理方式为不安全模式
    // 辅助阅读：`errorTaming` 配置项指定了对 `Error` 相关对象的处理策略。设置为 `'unsafe'` 表示不严格限制代码创建和使用 `Error` 对象，允许正常的错误处理流程。
    errorTaming: 'unsafe',
    // 翻译：数学对象的处理方式为不安全模式
    // 辅助阅读：`mathTaming` 用于控制 `Math` 对象的锁定程度。设置为 `'unsafe'` 时，代码可以自由使用 `Math` 对象的各种方法和属性，如 `Math.random`、`Math.sqrt` 等。
    mathTaming: 'unsafe',
    // 翻译：日期对象的处理方式为不安全模式
    // 辅助阅读：`dateTaming` 配置项针对 `Date` 对象。设置为 `'unsafe'` 允许代码正常创建和操作 `Date` 对象，例如使用 `new Date()` 创建日期实例，调用 `getDate` 等方法。
    dateTaming: 'unsafe',
    // 翻译：域对象的处理方式为不安全模式
    // 辅助阅读：`domainTaming` 涉及对域相关对象的处理。设置为 `'unsafe'` 表示不严格限制与域相关的操作，可能与代码运行的上下文环境或特定的安全域有关。
    domainTaming: 'unsafe',
    // 翻译：覆盖对象的处理方式为严格模式
    // 辅助阅读：`overrideTaming` 用于控制是否允许对内置对象的方法进行重写。设置为 `'severe'` 表示严格禁止对内置对象的方法进行覆盖，以确保内置对象的原始行为不被改变。
    overrideTaming: 'severe',
  });
} catch (error) {
  // 翻译：如果 `lockdown` 调用抛出异常，它会干扰某些版本 Firefox 上的内容脚本注入。这里捕获并记录错误，以便内容脚本仍然能够注入。这会影响 Firefox v56 和 Waterfox Classic。
  // 辅助阅读：在 `lockdown` 函数调用过程中，如果出现异常，会进入这个 `catch` 块。由于某些旧版本的 Firefox（如 v56）和 Waterfox Classic 中，`lockdown` 异常可能会影响内容脚本的注入，所以这里捕获异常并记录错误信息，以保证内容脚本能正常注入。
  console.error('Lockdown failed:', error);
  // 翻译：如果全局对象中有 sentry 并且有 captureException 方法
  // 辅助阅读：检查全局对象 `globalThis` 中是否存在 `sentry` 对象，并且该对象是否有 `captureException` 方法。`sentry` 是一个错误监控和报告工具，`captureException` 方法用于捕获并上报异常信息。
  if (globalThis.sentry && globalThis.sentry.captureException) {
    // 翻译：使用 sentry 捕获异常并上报
    // 辅助阅读：当满足上述条件时，创建一个新的 `Error` 对象，将 `lockdown` 失败的信息和原始错误信息组合起来，然后使用 `sentry` 的 `captureException` 方法将该异常信息上报到 Sentry 平台，方便开发者进行错误追踪和分析。
    globalThis.sentry.captureException(
      new Error(`Lockdown failed: ${error.message}`),
    );
  }
}
