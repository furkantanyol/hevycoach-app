const API_KEY_STORE_KEY = 'hevy_api_key';

// On web there is no keychain, so the key lives in localStorage. That's fine for a personal
// demo build, but this file must not be used as-is for a public deployment.
export function getApiKey(): Promise<string | null> {
  return Promise.resolve(localStorage.getItem(API_KEY_STORE_KEY));
}

export function setApiKey(apiKey: string): Promise<void> {
  localStorage.setItem(API_KEY_STORE_KEY, apiKey);
  return Promise.resolve();
}
