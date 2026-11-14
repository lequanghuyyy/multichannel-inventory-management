import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => false), getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(),
  setKeyPrefix: vi.fn(), setSynchronize: vi.fn(), setDefaultKeychainAccess: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.isNative } }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  SecureStorage: {
    getItem: mocks.getItem, setItem: mocks.setItem, removeItem: mocks.removeItem,
    setKeyPrefix: mocks.setKeyPrefix, setSynchronize: mocks.setSynchronize,
    setDefaultKeychainAccess: mocks.setDefaultKeychainAccess,
  },
}));

import { loadNativeSessionToken, removeNativeSessionToken, saveNativeSessionToken } from './native-session-storage';

afterEach(() => vi.clearAllMocks());

it('never falls back to localStorage on the web', async () => {
  const localSpy = vi.spyOn(Storage.prototype, 'setItem');
  await expect(loadNativeSessionToken()).resolves.toBe('');
  await expect(saveNativeSessionToken('secret')).rejects.toThrow('unavailable on the web');
  expect(localSpy).not.toHaveBeenCalled();
  expect(mocks.setItem).not.toHaveBeenCalled();
  localSpy.mockRestore();
});

it('retries secure-storage configuration after a transient configuration failure', async () => {
  mocks.isNative.mockReturnValue(true);
  mocks.setKeyPrefix.mockRejectedValueOnce(new Error('keystore unavailable')).mockResolvedValue(undefined);
  mocks.setSynchronize.mockResolvedValue(undefined);
  mocks.setDefaultKeychainAccess.mockResolvedValue(undefined);
  mocks.getItem.mockResolvedValue('persisted-token');

  await expect(loadNativeSessionToken()).rejects.toThrow('keystore unavailable');
  await expect(loadNativeSessionToken()).resolves.toBe('persisted-token');
  expect(mocks.setKeyPrefix).toHaveBeenCalledTimes(2);
});

it('serializes removal before a later token save', async () => {
  mocks.isNative.mockReturnValue(true);
  mocks.setKeyPrefix.mockResolvedValue(undefined);
  mocks.setSynchronize.mockResolvedValue(undefined);
  mocks.setDefaultKeychainAccess.mockResolvedValue(undefined);
  mocks.removeItem.mockResolvedValue(undefined);
  mocks.setItem.mockResolvedValue(undefined);

  const remove = removeNativeSessionToken();
  const save = saveNativeSessionToken('new-token');
  await Promise.all([remove, save]);

  expect(mocks.removeItem).toHaveBeenCalledBefore(mocks.setItem);
});
