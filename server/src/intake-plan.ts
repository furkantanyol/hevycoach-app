import { describe } from './coach.js';
import { RECENT_WORKOUTS } from './derived.js';
import { recentWorkouts } from './hevy.js';
import type { Turn } from './intake.js';
import { runProgram } from './plan.js';
import { type Reporter, withoutMarks } from './progress.js';
import { currentRoutines, formatRoutines } from './routines.js';
import type { Profile } from './state.js';
import { newMessage } from './thread.js';

const INITIAL_REASON = 'Initial intake';
const PARAGRAPH = '\n\n';
const CONTINUE_REASON = 'Continuing the routines the athlete already runs';
const READING_ROUTINES = 'Reading your routines';
/** The one line the new-to-Hevy script closes on: nothing reaches the coach that is not logged. */
const LOG_IN_HEVY = "Log your sessions in Hevy and I'll read them.";
const PLAN_FAILED = 'I could not write your block into Hevy just then. Ask me to try again and I will.';
const PLAN_LOG_FAILED = 'intake plan failed';

/** The routines behind the recent workouts, as the plan prompt reads them; undefined when there is nothing to continue. */
async function currentRoutinesText(turn: Turn): Promise<string | undefined> {
  const { hevy } = turn.deps;
  turn.report.status(READING_ROUTINES);
  const text = formatRoutines(await currentRoutines(hevy, await recentWorkouts(hevy, RECENT_WORKOUTS)));
  return text === '' ? undefined : text;
}

/**
 * The plan message is what streamed: the read, then the week's lines, and for the new script one
 * extra line, because nothing they do not log ever reaches the coach. The block rides along on the
 * message, so the app can lay the sessions out as cards.
 */
export async function writePlan(turn: Turn, profile: Profile): Promise<void> {
  const { deps, report } = turn;
  const spoken: string[] = [];
  const say: Reporter['say'] = (chunk) => {
    const clean = withoutMarks(chunk);
    spoken.push(clean);
    report.say(clean);
  };
  try {
    // A continuation with nothing found to continue is a fresh block, and its reason says so.
    const current = turn.path === 'continue' ? await currentRoutinesText(turn) : undefined;
    const reason = current === undefined ? INITIAL_REASON : CONTINUE_REASON;
    const { block } = await runProgram(deps, { profile, reason, current }, { status: report.status, say });
    if (turn.path === 'new') say(`${PARAGRAPH}${LOG_IN_HEVY}`);
    // One message, as the app streamed it: the app draws the read and the week's lines as two bubbles
    // while they stream (a status between them splits the parts) and as one after a reload. Saving
    // two would leave the server one message ahead of the app, and the app would re-import the thread.
    deps.state.messages.push(newMessage('assistant', spoken.join(''), { kind: 'plan', block }));
  } catch (error) {
    deps.log(`${PLAN_LOG_FAILED}: ${describe(error)}`);
    say(`${spoken.length > 0 ? PARAGRAPH : ''}${PLAN_FAILED}`);
    deps.state.messages.push(newMessage('assistant', spoken.join('')));
  }
  await deps.save();
}
