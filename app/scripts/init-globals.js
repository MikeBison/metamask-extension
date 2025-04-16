/**
 * 此脚本的主要目的是在全局对象 `globalThis` 中添加特定属性，并将其初始化为 `undefined`，
 * 以此来解决在 Manifest V3 的服务工作线程中，某些期望在浏览器环境运行的依赖项出错的问题。
 * 在浏览器环境中，这些依赖项通常可以正常使用全局对象提供的功能，
 * 但在服务工作线程里，这些功能可能不可用，因此需要进行这样的处理。
 */

// 定义一个数组 `keys`，其中包含了需要添加到全局对象 `globalThis` 中的属性名。
// 这里以 'XMLHttpRequest' 为例，它是一个在浏览器中用于发起 HTTP 请求的对象，
// 但在服务工作线程中可能无法直接使用。
// eslint-disable-next-line import/unambiguous
const keys = ['XMLHttpRequest'];

// 使用 `forEach` 方法遍历 `keys` 数组，对每个属性名进行处理。
keys.forEach((key) => {
  // 使用 `Reflect.has` 方法检查全局对象 `globalThis` 中是否已经存在当前属性名 `key`。
  // `Reflect.has` 是一个 ES6 提供的静态方法，用于检查对象是否具有某个属性。
  if (!Reflect.has(globalThis, key)) {
    // 如果全局对象中不存在该属性，则将其添加到全局对象中，并将其值初始化为 `undefined`。
    // 这样做的目的是让依赖这些属性的代码在运行时不会因为属性不存在而报错。
    globalThis[key] = undefined;
  }
});

// 检查全局对象 `globalThis` 中是否存在 'window' 属性。
// 在浏览器环境中，`window` 是全局对象，许多代码会依赖 `window` 对象来获取全局作用域。
// 但在服务工作线程中，`window` 对象可能不存在，因此需要进行处理。
if (!Reflect.has(globalThis, 'window')) {
  // 如果全局对象中不存在 'window' 属性，则将全局对象 `globalThis` 自身赋值给 'window' 属性。
  // 这样，依赖 `window` 对象的代码就可以正常使用全局对象的功能。
  globalThis.window = globalThis;
}
