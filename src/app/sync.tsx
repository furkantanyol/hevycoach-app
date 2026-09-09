// The screen itself is platform-split: Expo Router bundles this fallback route on every platform,
// so the web build must not reach expo-sqlite through it.
export { default } from '@/features/sync/sync-screen';
