/**
 * Status lines for a wait. The reply stream is text/plain; a status is one line "<mark><text>\n"
 * in it, the mark being U+001E, which the app shows beside the typing dots and drops from the
 * message, and which the server never saves. The last status is repeated every KEEPALIVE_MS,
 * because the proxy in front of the server closes a streamed response after ~100 s of silence and
 * a plan call takes longer than that.
 */
export type Write = (chunk: string) => void;
/** A line about the wait, shown beside the typing dots and never kept in the thread. */
export type Progress = (text: string) => void;

export interface ProgressChannel {
  status: Progress;
  stop: () => void;
}

/** What the athlete sees while the coach works: a status beside the dots, and words as they are written. */
export interface Reporter {
  status: Progress;
  say: Write;
}

export const STATUS_MARK = '\u001E';
export const NO_PROGRESS: Progress = () => {};
export const NO_REPORT: Reporter = { status: NO_PROGRESS, say: () => {} };
const KEEPALIVE_MS = 15_000;

export function progressChannel(write: Write): ProgressChannel {
  let last: string | null = null;
  const send = (): void => {
    if (last !== null) write(`${STATUS_MARK}${last}\n`);
  };
  const heartbeat = setInterval(send, KEEPALIVE_MS);
  return {
    status: (text) => {
      last = text;
      send();
    },
    stop: () => clearInterval(heartbeat),
  };
}

/** Model text never carries the mark: a stray one would make the app read the rest of its line as a status. */
export const withoutMarks = (text: string): string => text.replaceAll(STATUS_MARK, '');
