/**
 * The one way the app talks to the coach server: base URL plus the bearer
 * token, and a hook that keeps the screen's copy of a GET fresh. The app
 * stores nothing, so it reads the server on mount and again whenever the app
 * comes back to the foreground.
 */
import { useFocusEffect } from 'expo-router';
// React Native's global fetch cannot stream a response body; expo/fetch can,
// and the chat adapter needs a stream, so every call goes through this one.
import { fetch } from 'expo/fetch';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export interface ServerRequest {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface ServerState<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly refresh: () => void;
}

interface ErrorResponse {
  readonly status: number;
  readonly text: () => Promise<string>;
}

const baseUrl = process.env.EXPO_PUBLIC_COACH_URL;
const appToken = process.env.EXPO_PUBLIC_APP_TOKEN;

if (!baseUrl) {
  throw new Error('EXPO_PUBLIC_COACH_URL is missing. Set it in the app .env before starting Metro.');
}
if (!appToken) {
  throw new Error('EXPO_PUBLIC_APP_TOKEN is missing. Set it in the app .env before starting Metro.');
}

/** Every call to the coach server: base URL + bearer token. */
export function serverFetch(path: string, init: ServerRequest = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: init.method,
    body: init.body,
    signal: init.signal,
    headers: { ...init.headers, Authorization: `Bearer ${appToken}` },
  });
}

/** The server answers errors as JSON `{ error }`; fall back to the status line. */
export async function serverErrorMessage(response: ErrorResponse): Promise<string> {
  try {
    const body = await response.text();
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const { error } = parsed as { error: unknown };
      if (typeof error === 'string') return error;
    }
    return body || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** A JSON call that throws the server's own `{ error }` message on non-2xx. */
export async function serverJson<T>(path: string, init?: ServerRequest): Promise<T> {
  const response = await serverFetch(path, init);
  if (!response.ok) throw new Error(await serverErrorMessage(response));
  const payload: unknown = await response.json();
  return payload as T;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A GET the screen owns. `useFocusEffect` covers both the first render and
 * every later return to the screen, so there is no separate mount effect to
 * double the request. Only call this from inside a navigator screen.
 */
export function useServer<T>(path: string): ServerState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = latestRequest.current + 1;
    latestRequest.current = request;
    setLoading(true);
    try {
      const payload = await serverJson<T>(path);
      if (request !== latestRequest.current) return;
      setData(payload);
      setError(null);
    } catch (cause) {
      if (request !== latestRequest.current) return;
      setError(describeError(cause));
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [path]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useFocusEffect(refresh);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { data, error, loading, refresh };
}
