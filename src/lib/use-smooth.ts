/**
 * assistant-ui's `useSmooth` (packages/react/src/utils/smooth/useSmooth.ts), brought over whole
 * because @assistant-ui/react-native 0.1.40 ships no smoothing: the same `TextStreamAnimator`
 * driven by requestAnimationFrame, the same defaults (the buffered text drains within 250 ms, never
 * faster than 5 ms a character), the same reset when the part changes under it, and the same
 * immediate commit when the source settles before a frame ran. Reduce Motion commits the full
 * text at once, as the web hook does under `prefers-reduced-motion`.
 */
import { useEffect, useRef, useState } from 'react';

import { useReduceMotion } from '../components/cards/expanded-card';

const DEFAULT_DRAIN_MS = 250;
const DEFAULT_MAX_CHAR_INTERVAL_MS = 5;

/** The library's tuning knobs: how long a buffered burst takes to drain, and the slowest a character may come. */
export interface SmoothOptions {
  readonly drainMs?: number;
  readonly maxCharIntervalMs?: number;
}

interface PartText {
  readonly text: string;
  readonly status: { readonly type: string };
}

const RUNNING = Object.freeze({ type: 'running' });

class TextStreamAnimator {
  private frame: number | null = null;
  private lastUpdateTime = Date.now();
  targetText = '';
  currentText: string;
  drainMs = DEFAULT_DRAIN_MS;
  maxCharIntervalMs = DEFAULT_MAX_CHAR_INTERVAL_MS;
  private readonly setText: (text: string) => void;

  constructor(currentText: string, setText: (text: string) => void) {
    this.currentText = currentText;
    this.setText = setText;
  }

  start(): void {
    if (this.frame !== null) return;
    this.lastUpdateTime = Date.now();
    this.animate();
  }

  stop(): void {
    if (this.frame === null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private readonly animate = (): void => {
    const now = Date.now();
    let timeToConsume = now - this.lastUpdateTime;
    const remaining = this.targetText.length - this.currentText.length;
    const perChar = Math.min(this.maxCharIntervalMs, this.drainMs / remaining);
    let chars = 0;
    while (timeToConsume >= perChar && chars < remaining) {
      chars += 1;
      timeToConsume -= perChar;
    }
    this.frame = chars === remaining ? null : requestAnimationFrame(this.animate);
    if (chars === 0) return;
    this.currentText = this.targetText.slice(0, this.currentText.length + chars);
    this.lastUpdateTime = now - timeToConsume;
    this.setText(this.currentText);
  };
}

/** The part's text as revealed so far, and `running` until the reveal has caught up with it. */
export function useSmooth(part: PartText, options: SmoothOptions = {}): PartText {
  const { text, status } = part;
  const enabled = !useReduceMotion();
  const running = status.type === 'running';
  const [displayed, setDisplayed] = useState(running ? '' : text);
  const animator = useRef<TextStreamAnimator | null>(null);

  // A new part, or text that changed under the reveal: start over, or show it whole if it is done.
  if (!text.startsWith(displayed)) setDisplayed(running ? '' : text);
  // Settled before a frame ran: commit at once, so a missed frame cannot leave an empty bubble.
  if (!running && displayed === '' && text !== '') setDisplayed(text);

  useEffect(() => {
    animator.current ??= new TextStreamAnimator('', setDisplayed);
    const stream = animator.current;
    stream.drainMs = options.drainMs ?? DEFAULT_DRAIN_MS;
    stream.maxCharIntervalMs = options.maxCharIntervalMs ?? DEFAULT_MAX_CHAR_INTERVAL_MS;
    if (!enabled) {
      stream.stop();
      return;
    }
    if (!text.startsWith(stream.targetText) || (!running && stream.currentText === '')) {
      stream.currentText = running ? '' : text;
    }
    stream.targetText = text;
    // Never stopped between chunks: a restart resets the animator's clock, and it would reveal
    // almost nothing while the stream runs, then everything after it ends.
    stream.start();
  }, [enabled, options.drainMs, options.maxCharIntervalMs, running, text]);

  useEffect(() => () => animator.current?.stop(), []);

  if (!enabled) return part;
  return { text: displayed, status: displayed === text ? status : RUNNING };
}
