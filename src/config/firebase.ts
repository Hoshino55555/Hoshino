import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// getReactNativePersistence is only re-exported in the RN build; default types
// (picked up by tsc for node) don't include it, so we import via ts-ignore.
// @ts-ignore - available at runtime under Metro's react-native export condition.
import { initializeAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import { getFunctions, type Functions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase Functions configuration
export const FIREBASE_CONFIG = {
  projectId: 'hoshino-996d0',
  region: 'us-central1',
  functionsBaseUrl: 'https://us-central1-hoshino-996d0.cloudfunctions.net',
  functions: {
    generateNFTTransaction: 'https://us-central1-hoshino-996d0.cloudfunctions.net/generateNFTTransaction',
    generateCurrencyPurchaseTransaction: 'https://us-central1-hoshino-996d0.cloudfunctions.net/generateCurrencyPurchaseTransaction',
    fetchNFTMetadata: 'https://us-central1-hoshino-996d0.cloudfunctions.net/fetchNFTMetadata',
    chat: 'https://us-central1-hoshino-996d0.cloudfunctions.net/chat',
    getConversation: 'https://us-central1-hoshino-996d0.cloudfunctions.net/getConversation',
    health: 'https://us-central1-hoshino-996d0.cloudfunctions.net/health',
    solanaHealth: 'https://us-central1-hoshino-996d0.cloudfunctions.net/solanaHealth',
  },
};

export const getFunctionUrl = (functionName: keyof typeof FIREBASE_CONFIG.functions): string =>
  FIREBASE_CONFIG.functions[functionName];

// Expo uses EXPO_PUBLIC_* env vars at runtime. Accept legacy REACT_APP_* names
// so existing .env files don't break.
const pick = (...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return undefined;
};

const firebaseConfig = {
  apiKey: pick('EXPO_PUBLIC_FIREBASE_API_KEY', 'REACT_APP_FIREBASE_API_KEY'),
  authDomain: pick('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', 'REACT_APP_FIREBASE_AUTH_DOMAIN'),
  projectId: pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'REACT_APP_FIREBASE_PROJECT_ID') || FIREBASE_CONFIG.projectId,
  storageBucket: pick('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', 'REACT_APP_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: pick('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'REACT_APP_FIREBASE_MESSAGING_SENDER_ID'),
  appId: pick('EXPO_PUBLIC_FIREBASE_APP_ID', 'REACT_APP_FIREBASE_APP_ID'),
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

// Auth needs React Native AsyncStorage persistence or it re-prompts on every reload.
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (_e) {
  // initializeAuth throws if already initialized (e.g. Fast Refresh). Fall back to getAuth.
  const { getAuth } = require('firebase/auth');
  auth = getAuth(app);
}
export { auth };

export const functions: Functions = getFunctions(app, FIREBASE_CONFIG.region);

export default app;
