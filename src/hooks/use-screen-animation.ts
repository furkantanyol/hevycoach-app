import { useReducedMotion } from 'react-native-reanimated';

/**
 * Reduce Motion turns the push transition off rather than merely shortening it. Every stack in the
 * app passes this, so the setting is honoured wherever a screen is pushed.
 */
export function useScreenAnimation(): 'default' | 'none' {
  return useReducedMotion() ? 'none' : 'default';
}
