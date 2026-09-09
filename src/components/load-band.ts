import { LOAD_STEPS, type LoadStep } from '@/constants/theme';

/** With every session in the week the same size, none of them is the heavy one. */
const EVEN_WEEK_STEP: LoadStep = 3;

/**
 * Which band a session is drawn in: its own stored target volume ranked against the other sessions
 * in the same week. This is a display scale and nothing else — it says which of the lifter's own
 * planned sessions is the bigger one, never how hard a session should be. Loads, rep ranges and
 * intensity belong to the rules engine, which does not exist yet.
 *
 * A day with no session, or a week with nothing planned in it, has no band at all.
 */
export function loadStep(volume: number, weekVolumes: readonly number[]): LoadStep | null {
  const planned = weekVolumes.filter((weekVolume) => weekVolume > 0);

  if (volume <= 0 || planned.length === 0) {
    return null;
  }

  const lightest = Math.min(...planned);
  const heaviest = Math.max(...planned);

  if (heaviest === lightest) {
    return EVEN_WEEK_STEP;
  }

  const position = (volume - lightest) / (heaviest - lightest);

  return LOAD_STEPS[Math.round(position * (LOAD_STEPS.length - 1))];
}
