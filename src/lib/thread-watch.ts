/**
 * The server grows the thread on its own after a workout: the "workout logged" bubble, then the
 * review. It announces every change on GET /events (server-sent events, the thread's length as the
 * data), and this keeps one such stream open, reconnecting a few seconds after it drops. A length
 * beyond what is on screen imports the fresh history into the running thread (`thread.import`, the
 * call the history adapter feeds) and refetches the cards, so Last workout and Next session move
 * with it. No remount: a remount empties the list until the history returns, which read as the chat
 * going blank. A run or a draft postpones the import, which would otherwise cut across them.
 */
import { useAui, useAuiState } from '@assistant-ui/react-native';
import { useEffect, useRef } from 'react';

import { coachHistoryAdapter } from '../coach-adapter';
import { serverChanged, serverFetch } from './server';

const EVENTS_PATH = '/events';
const RETRY_MS = 3_000;
const FRAME_END = '\n\n';
const DATA_PREFIX = 'data: ';

/** The thread length an event frame carries, or null for a keep-alive comment. */
function lengthOf(frame: string): number | null {
  const data = frame.split('\n').find((line) => line.startsWith(DATA_PREFIX));
  if (data === undefined) return null;
  const length = Number(data.slice(DATA_PREFIX.length));
  return Number.isFinite(length) ? length : null;
}

/** Reads one event stream until it ends or the signal aborts, handing every thread length on. */
async function readEvents(signal: AbortSignal, onLength: (length: number) => void): Promise<void> {
  const response = await serverFetch(EVENTS_PATH, { signal });
  if (!response.ok || response.body === null) throw new Error(`events: ${response.status}`);
  const reader = response.body.getReader();
  // Expo's fetch rejects the closed promise when the stream is aborted; settle it so the abort stays quiet.
  reader.closed.catch(() => undefined);
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(FRAME_END);
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const length = lengthOf(frame);
      if (length !== null) onLength(length);
    }
  }
}

/** The cards read again, and the thread takes the server's history in place. A failure waits for the next event. */
async function refresh(aui: ReturnType<typeof useAui>): Promise<void> {
  serverChanged();
  try {
    aui.thread.import(await coachHistoryAdapter.load());
  } catch {
    // The stream's next frame, or the reconnect, tries again.
  }
}

export function useThreadWatch(): void {
  const aui = useAui();
  const shown = useAuiState((s) => s.thread.messages.length);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const draft = useAuiState((s) => s.composer.text);
  // Not while the runtime is still loading the history itself: the first event would import it twice.
  const isLoading = useAuiState((s) => s.thread.isLoading);
  const idle = !isRunning && !isLoading && draft === '';
  const onServer = useRef(shown);
  const canReload = useRef(idle);
  const visible = useRef(shown);

  useEffect(() => {
    canReload.current = idle;
    visible.current = shown;
    // A change that arrived mid-run or mid-draft is applied once the thread is idle again.
    if (idle && onServer.current > shown) void refresh(aui);
  }, [aui, idle, shown]);

  useEffect(() => {
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const onLength = (length: number) => {
      onServer.current = length;
      if (canReload.current && length > visible.current) void refresh(aui);
    };
    const listen = async () => {
      try {
        await readEvents(controller.signal, onLength);
      } catch {
        // Dropped or refused: reconnect below, the first frame catches up on anything missed.
      }
      if (!controller.signal.aborted) retry = setTimeout(() => void listen(), RETRY_MS);
    };
    void listen();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [aui]);
}
