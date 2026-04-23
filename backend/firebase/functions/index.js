const { onRequest } = require('firebase-functions/v2/https');

// Shared admin instance (initializes Firebase Admin exactly once)
require('./admin');

// Legacy HTTP functions
const aiChatFunctions = require('./ai-chat');
const solanaTransactionFunctions = require('./solana-transactions');

// New callable functions
const authBridge = require('./auth-bridge');
const gameState = require('./game-state');

// AI chat
exports.chat = aiChatFunctions.chat;
exports.getConversation = aiChatFunctions.getConversation;

// Solana transactions
exports.generateNFTTransaction = solanaTransactionFunctions.generateNFTTransaction;
exports.generateCurrencyPurchaseTransaction =
  solanaTransactionFunctions.generateCurrencyPurchaseTransaction;
exports.fetchNFTMetadata = solanaTransactionFunctions.fetchNFTMetadata;
exports.solanaHealth = solanaTransactionFunctions.solanaHealth;

// Privy → Firebase auth bridge
exports.exchangePrivyToken = authBridge.exchangePrivyToken;

// Server-authoritative game state
exports.getGameState = gameState.getGameState;
exports.setTimezone = gameState.setTimezone;
exports.feedMoonoko = gameState.feedMoonoko;
exports.recordPlay = gameState.recordPlay;
exports.recordChat = gameState.recordChat;
exports.startSleep = gameState.startSleep;
exports.endSleep = gameState.endSleep;
exports.drainForaged = gameState.drainForaged;

// Health check
exports.health = onRequest({ cors: ['*'], invoker: 'public' }, async (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    functions: [
      'chat',
      'getConversation',
      'generateNFTTransaction',
      'generateCurrencyPurchaseTransaction',
      'fetchNFTMetadata',
      'solanaHealth',
      'exchangePrivyToken',
      'getGameState',
      'setTimezone',
      'feedMoonoko',
      'recordPlay',
      'recordChat',
      'startSleep',
      'endSleep',
      'drainForaged',
      'health',
    ],
  });
});
