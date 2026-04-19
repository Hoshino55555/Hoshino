// Shim for Node builtins not available in React Native.
// Every property access returns a noop function so callers like
// `util.promisify(zlib.inflateRaw)` see a Function and don't crash at
// module-load. Actual invocation throws, which is intentional — the RN
// paths shouldn't be hitting these APIs at runtime.
//
// `__esModule: true` is critical: it tells Babel's ESM-to-CJS interop to
// return this module directly instead of copying enumerable own-props
// into a new object (Proxy `get` traps don't enumerate, so that copy
// would produce an empty object and named imports would be undefined).

const noop = function () {
  throw new Error('Node builtin not available in React Native (metro-empty-shim)');
};

module.exports = new Proxy(function () {}, {
  get(target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return module.exports;
    return noop;
  },
  apply() {
    return undefined;
  },
});
