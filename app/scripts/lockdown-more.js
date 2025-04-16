// 翻译：尽可能将 globalThis 的所有 “对象” 和 “函数” 自有属性设置为不可配置且不可写。
// 辅助阅读：代码的目标是对 globalThis 对象上的对象和函数类型的自有属性进行安全加固，将其设置为不可配置和不可写，以防止这些属性被意外或恶意修改，增强代码运行环境的安全性。

// 翻译：我们将不可配置且不可写的属性称为 “不可修改” 属性。
// 辅助阅读：明确了代码中对属性状态的一种定义，后续的操作就是围绕将某些属性转换为这种 “不可修改” 状态来进行的。

try {
  /**
   * 翻译：`lockdown` 仅会强化由 'ses/src/whitelist' 中指定的 universalPropertyNames 常量所枚举的属性。此函数会将起始隔离区全局作用域中的所有函数和对象属性设置为不可配置且不可写，除非这些属性本身已经是不可配置的，或者它们被 LavaMoat 运行时屏蔽了（LavaMoat#360）。
   * 辅助阅读：说明了 `lockdown` 函数的局限性，即它只能强化部分特定的属性，而此函数的作用是对 `lockdown` 未处理的属性进行补充处理，进一步加固全局环境。同时提到了 LavaMoat 运行时可能会对某些属性进行屏蔽，这些被屏蔽的属性将不会被此函数处理。
   *
   * 翻译：此函数在初始化过程中的正确执行时机至关重要，应始终在调用 `lockdown` 之后立即执行。在编写此代码时，此函数对运行时环境所做的修改似乎不会导致程序崩溃，但随着依赖项的添加或 HTML 文件中脚本顺序的改变，情况可能会发生变化。请谨慎操作。
   * 辅助阅读：强调了函数执行顺序的重要性，因为它依赖于 `lockdown` 函数的执行结果，并且可能会受到代码环境变化的影响。开发者需要注意这些潜在的风险，以确保代码的稳定性。
   *
   * 翻译：具体实现细节请参阅内联注释。
   * 辅助阅读：提示开发者可以通过查看代码内部的注释来了解函数的具体实现逻辑。
   *
   * 翻译：我们将此函数写成立即执行函数表达式（IIFE）的形式，以避免污染全局作用域。
   * 辅助阅读：采用 IIFE 形式可以将函数内部的变量和逻辑封装起来，防止它们泄露到全局作用域中，避免与其他代码产生命名冲突。
   */
  (function protectIntrinsics() {
    // 翻译：用于匹配 LavaMoat 屏蔽错误消息的正则表达式
    // 辅助阅读：定义了一个正则表达式，用于检查捕获的错误消息是否是由 LavaMoat 屏蔽属性导致的，以便在后续处理中进行区分。
    const lmre =
      /LavaMoat - property "[A-Za-z0-9]*" of globalThis is inaccessible under scuttling mode/u;

    // 翻译：获取一个新隔离区全局作用域的自有属性键
    // 辅助阅读：通过创建一个新的 Compartment 实例并获取其 globalThis 的自有属性键，这些属性键代表了一些需要处理的基础属性。
    const namedIntrinsics = Reflect.ownKeys(new Compartment().globalThis);

    // 翻译：这些命名的内置对象不会被 `lockdown` 自动加固
    // 辅助阅读：定义了一个 Set 集合，包含了一些需要手动加固的属性，因为 `lockdown` 函数不会自动处理它们。
    const shouldHardenManually = new Set(['eval', 'Function', 'Symbol']);

    // 翻译：全局属性集合
    // 辅助阅读：创建一个 Set 集合，用于存储需要处理的全局属性。集合中包含了新隔离区全局作用域的自有属性键，并且注释中提到后续可能会添加更多的平台全局属性。
    const globalProperties = new Set([
      // 翻译：universalPropertyNames 是 `lockdown` 在全局作用域中添加的一个常量，在编写此代码时，它在 'ses/src/whitelist' 中初始化。这些属性通常是不可枚举的。
      // 辅助阅读：解释了 namedIntrinsics 来源的常量的相关信息，以及这些属性的特性。
      ...namedIntrinsics,

      // 翻译：TODO: 还应包含命名的平台全局属性，这会获取 globalThis 上的所有可枚举属性。
      // 辅助阅读：提示开发者后续可以考虑添加更多的平台全局属性到处理范围中，目前只是注释说明，未实际添加。
      // ...Object.keys(globalThis),
    ]);

    // 翻译：遍历全局属性集合
    // 辅助阅读：对存储的全局属性进行遍历，对每个属性进行处理。
    globalProperties.forEach((propertyName) => {
      // 翻译：获取 globalThis 上指定属性的描述符
      // 辅助阅读：使用 Reflect.getOwnPropertyDescriptor 方法获取指定属性的描述符，描述符包含了属性的各种特性，如是否可配置、是否可写等。
      const descriptor = Reflect.getOwnPropertyDescriptor(
        globalThis,
        propertyName,
      );

      // 翻译：如果属性描述符存在
      // 辅助阅读：只有当属性描述符存在时，才会对该属性进行后续处理。
      if (descriptor) {
        // 翻译：如果属性是可配置的
        // 辅助阅读：检查属性的可配置性，如果可配置，则进行相应的修改。
        if (descriptor.configurable) {
          // 翻译：如果 globalThis 上的属性是可配置的，将其设置为不可配置。如果该属性没有访问器属性，也将其设置为不可写。
          // 辅助阅读：根据属性是否有访问器属性（getter 或 setter）来决定如何修改属性的描述符。因为不能同时设置 `writable` 和访问器属性，所以需要进行区分处理。
          if (hasAccessor(descriptor)) {
            Object.defineProperty(globalThis, propertyName, {
              configurable: false,
            });
          } else {
            Object.defineProperty(globalThis, propertyName, {
              configurable: false,
              writable: false,
            });
          }
        }

        // 翻译：如果该属性需要手动加固
        // 辅助阅读：检查当前属性是否在需要手动加固的集合中，如果是，则尝试对其进行加固操作。
        if (shouldHardenManually.has(propertyName)) {
          try {
            // 翻译：对该属性进行加固
            // 辅助阅读：使用 `harden` 函数对属性进行加固，使其更加安全。
            harden(globalThis[propertyName]);
          } catch (err) {
            // 翻译：如果错误消息不是 LavaMoat 屏蔽错误
            // 辅助阅读：使用之前定义的正则表达式检查错误消息，如果不是 LavaMoat 屏蔽导致的错误，则重新抛出错误；否则，给出警告信息。
            if (!lmre.test(err.message)) {
              throw err;
            }
            console.warn(
              `Property ${propertyName} will not be hardened`,
              `because it is scuttled by LavaMoat protection.`,
              `Visit https://github.com/LavaMoat/LavaMoat/pull/360 to learn more.`,
            );
          }
        }
      }
    });

    /**
     * 翻译：检查给定属性描述符是否有任何访问器，即 `get` 或 `set` 属性。
     * 辅助阅读：该函数的作用是判断属性描述符中是否包含访问器属性，以便在修改属性描述符时进行正确的处理。
     *
     * 翻译：我们希望将全局属性设置为不可写，但不能同时设置 `writable` 属性和访问器属性。
     * 辅助阅读：解释了为什么需要检查访问器属性，因为 JavaScript 中不能同时设置 `writable` 和访问器属性，所以需要根据是否有访问器属性来决定如何修改属性描述符。
     *
     * @param {object} descriptor - 要检查的属性描述符。
     * 翻译：@param {object} descriptor - 要检查的属性描述符。
     * 辅助阅读：明确了函数的参数类型和含义，即传入一个属性描述符对象。
     * @returns {boolean} 是否该属性描述符有任何访问器。
     * 翻译：@returns {boolean} 该属性描述符是否有任何访问器。
     * 辅助阅读：说明了函数的返回值类型和含义，返回一个布尔值表示属性描述符是否包含访问器属性。
     */
    function hasAccessor(descriptor) {
      return 'set' in descriptor || 'get' in descriptor;
    }
  })();
} catch (error) {
  // 翻译：保护内置对象失败
  // 辅助阅读：当在执行保护内置对象的过程中出现异常时，将错误信息输出到控制台。
  console.error('Protecting intrinsics failed:', error);
  // 翻译：如果全局对象中有 sentry 并且有 captureException 方法
  // 辅助阅读：检查全局对象 `globalThis` 中是否存在 `sentry` 对象，并且该对象是否有 `captureException` 方法。`sentry` 是一个错误监控和报告工具，`captureException` 方法用于捕获并上报异常信息。
  if (globalThis.sentry && globalThis.sentry.captureException) {
    // 翻译：使用 sentry 捕获异常并上报
    // 辅助阅读：当满足上述条件时，创建一个新的 `Error` 对象，将保护内置对象失败的信息和原始错误信息组合起来，然后使用 `sentry` 的 `captureException` 方法将该异常信息上报到 Sentry 平台，方便开发者进行错误追踪和分析。
    globalThis.sentry.captureException(
      new Error(`Protecting intrinsics failed: ${error.message}`),
    );
  }
}
