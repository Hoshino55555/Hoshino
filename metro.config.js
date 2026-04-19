const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Explicitly set project root and watch folders
config.projectRoot = projectRoot;
config.watchFolders = [projectRoot];

const nodeModulesPath = path.resolve(projectRoot, 'node_modules');
const emptyModulePath = path.resolve(projectRoot, 'metro-empty-shim.js');
const joseBrowserRoot = path.resolve(projectRoot, 'node_modules/jose/dist/browser');

// Polyfill Node builtins so Solana Web3.js + its transitive deps (crypto-browserify, cipher-base, etc.) resolve.
// extraNodeModules is applied when Metro fails to resolve a bare specifier from node_modules too,
// which resolver.alias does NOT reliably do for nested requires.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  assert: path.join(nodeModulesPath, 'assert'),
  buffer: path.join(nodeModulesPath, 'buffer'),
  crypto: path.join(nodeModulesPath, 'crypto-browserify'),
  stream: path.join(nodeModulesPath, 'stream-browserify'),
  util: path.join(nodeModulesPath, 'util'),
  process: path.join(nodeModulesPath, 'process/browser.js'),
  path: path.join(nodeModulesPath, 'path-browserify'),
  events: path.join(nodeModulesPath, 'events'),
  string_decoder: path.join(nodeModulesPath, 'string_decoder'),
  // Node builtins with no RN analogue — point at empty shim
  fs: emptyModulePath,
  os: emptyModulePath,
  http: emptyModulePath,
  https: emptyModulePath,
  url: emptyModulePath,
  querystring: emptyModulePath,
  zlib: emptyModulePath,
  tty: emptyModulePath,
  net: emptyModulePath,
  child_process: emptyModulePath,
  constants: emptyModulePath,
  domain: emptyModulePath,
  punycode: emptyModulePath,
  timers: emptyModulePath,
  tls: emptyModulePath,
  vm: emptyModulePath,
  worker_threads: emptyModulePath,
};

// resolver.alias takes precedence over node_modules lookup, so we use it for
// packages that ARE installed but where we want to force a specific sub-path
// (e.g. jose's browser build, which uses WebCrypto and avoids zlib/node builtins).
config.resolver.alias = {
  ...config.resolver.alias,
  jose: path.resolve(projectRoot, 'node_modules/jose/dist/browser/index.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'jose') {
    return {
      type: 'sourceFile',
      filePath: path.join(joseBrowserRoot, 'index.js'),
    };
  }

  if (moduleName.startsWith('jose/')) {
    const subPath = moduleName.slice('jose/'.length);
    const filePath = subPath.endsWith('.js')
      ? path.join(joseBrowserRoot, subPath)
      : path.join(joseBrowserRoot, `${subPath}.js`);

    return {
      type: 'sourceFile',
      filePath,
    };
  }

  return resolve(context, moduleName, platform);
};

config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config; 
