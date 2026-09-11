import { describe, expect, it } from 'vitest';
import { deliveryOf } from './body.js';

const WORKOUT = 'w-1';

describe('deliveryOf', () => {
  it("should read Hevy's live shape, a bare workoutId, which doubles as the event id", () => {
    expect(deliveryOf({ workoutId: WORKOUT })).toEqual({ id: WORKOUT, workoutId: WORKOUT });
  });

  it('should read the documented shape', () => {
    expect(deliveryOf({ id: 'evt-1', payload: { workoutId: WORKOUT } })).toEqual({ id: 'evt-1', workoutId: WORKOUT });
  });

  it('should read a snake_case workout id and a numeric event id', () => {
    expect(deliveryOf({ id: 7, payload: { workout_id: WORKOUT } })).toEqual({ id: '7', workoutId: WORKOUT });
  });

  it('should read a payload sent as a JSON string, or flattened into the body', () => {
    expect([deliveryOf({ id: 'evt-2', payload: JSON.stringify({ workoutId: WORKOUT }) }), deliveryOf({ id: 'evt-3', workoutId: WORKOUT })]).toEqual([
      { id: 'evt-2', workoutId: WORKOUT },
      { id: 'evt-3', workoutId: WORKOUT },
    ]);
  });

  it('should reject a body without a workout id', () => {
    expect([deliveryOf({ id: 'evt-4', payload: {} }), deliveryOf({}), deliveryOf('nope'), deliveryOf(null)]).toEqual([null, null, null, null]);
  });
});
