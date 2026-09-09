import { describeQueryState, queryState } from './query-state';

const IDLE = { isPending: false, fetchStatus: 'idle', error: null } as const;

describe('queryState', () => {
  it('should report loading while the first read is in flight', () => {
    expect(queryState({ ...IDLE, isPending: true, fetchStatus: 'fetching' }, false)).toEqual({
      kind: 'loading',
    });
  });

  it('should report offline when the fetch is paused, not an error', () => {
    expect(queryState({ ...IDLE, isPending: true, fetchStatus: 'paused' }, false)).toEqual({
      kind: 'offline',
      hasRows: false,
    });
  });

  it('should keep the cached rows when a paused fetch sits on a warm cache', () => {
    const state = queryState({ ...IDLE, fetchStatus: 'paused' }, true);

    expect(state).toEqual({ kind: 'offline', hasRows: true });
    expect(describeQueryState(state, 'nothing')).toBe('Offline — showing what was last read from Hevy.');
  });

  it('should surface the query error message so a missing key reads differently from an outage', () => {
    const state = queryState({ ...IDLE, error: new Error('Save your Hevy API key first.') }, false);

    expect(describeQueryState(state, 'nothing')).toBe('Save your Hevy API key first.');
  });

  it('should report empty when Hevy answered with nothing', () => {
    expect(describeQueryState(queryState(IDLE, false), 'No routines saved in Hevy yet.')).toBe(
      'No routines saved in Hevy yet.'
    );
  });

  it('should say nothing at all once there are rows to render', () => {
    expect(describeQueryState(queryState(IDLE, true), 'nothing')).toBeNull();
  });

  it('should say nothing about an empty answer a screen already speaks for', () => {
    expect(describeQueryState(queryState(IDLE, false), null)).toBeNull();
  });

  it('should still surface an error on a query whose emptiness says nothing', () => {
    const state = queryState({ ...IDLE, error: new Error('Hevy rejected the key.') }, false);

    expect(describeQueryState(state, null)).toBe('Hevy rejected the key.');
  });
});
