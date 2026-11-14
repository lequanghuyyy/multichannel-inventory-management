import { Capacitor } from '@capacitor/core';
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';

const sessionKey = 'opaque-session';
let configured: Promise<void> | null = null;
let transition = Promise.resolve();

export function isNativeSession(): boolean {
  return Capacitor.isNativePlatform();
}

async function configure(): Promise<void> {
  if (!isNativeSession()) throw new Error('Native secure storage is unavailable on the web.');
  if (configured) return configured;
  const next = (async () => {
    await SecureStorage.setKeyPrefix('datt-auth_');
    await SecureStorage.setSynchronize(false);
    await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
  })();
  configured = next;
  try {
    await next;
  } catch (error) {
    if (configured === next) configured = null;
    throw error;
  }
}

export async function loadNativeSessionToken(): Promise<string> {
  if (!isNativeSession()) return '';
  await configure();
  return await SecureStorage.getItem(sessionKey) ?? '';
}

export async function saveNativeSessionToken(token: string): Promise<void> {
  const next = transition.then(async () => {
    await configure();
    await SecureStorage.setItem(sessionKey, token);
  });
  transition = next.catch(() => undefined);
  return next;
}

export async function removeNativeSessionToken(): Promise<void> {
  if (!isNativeSession()) return;
  const next = transition.then(async () => {
    await configure();
    await SecureStorage.removeItem(sessionKey);
  });
  transition = next.catch(() => undefined);
  return next;
}
