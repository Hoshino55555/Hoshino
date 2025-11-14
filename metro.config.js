const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Explicitly set project root and watch folders
config.projectRoot = projectRoot;
config.watchFolders = [projectRoot];

// Add Node.js polyfills for Solana Web3.js
config.resolver.alias = {
  ...config.resolver.alias,
  'assert': 'assert',
  'buffer': 'buffer',
  'crypto': 'crypto-browserify',
  'stream': 'stream-browserify',
  'util': 'util',
  'process': 'process/browser',
  'path': 'path-browserify',
  // Disable Node.js modules not needed in React Native
  'fs': false,
  'os': false,
  'http': false,
  'https': false,
  'url': false,
  'querystring': false,
  'zlib': false,
  'tty': false,
  'net': false,
  'child_process': false,
  'constants': false,
  'domain': false,
  'punycode': false,
  'string_decoder': false,
  'timers': false,
  'tls': false,
  'vm': false,
  'worker_threads': false,
};

// Add polyfills to the resolver
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config; 