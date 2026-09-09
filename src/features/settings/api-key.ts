import * as SecureStore from 'expo-secure-store';

const API_KEY_STORE_KEY = 'hevy_api_key';

/** The Hevy API key lives in the keychain only, and is never logged or persisted elsewhere. */
export function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY_STORE_KEY);
}

export function setApiKey(apiKey: string): Promise<void> {
  return SecureStore.setItemAsync(API_KEY_STORE_KEY, apiKey);
}
