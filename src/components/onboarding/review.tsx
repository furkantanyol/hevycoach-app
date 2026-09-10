/**
 * Step 6. Every answer as a row, grouped by the step that owns it, each row the
 * way back to that step. "Build my block" saves the profile and then asks the
 * coach for the block in the thread's own words, because the plan is still
 * built through the chat (docs/spec.md, Amendment 2026-09-10).
 */
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { draftProfile, type Draft } from '../../lib/onboarding-draft';
import { ONBOARDING_STEPS, stepForField, type ProfileField } from '../../lib/onboarding-steps';
import { FIELD_LABELS, profileValue } from '../../lib/options';
import { describeError, serverErrorMessage, serverFetch } from '../../lib/server';
import type { Profile } from '../../lib/types';
import { useTheme } from '../assistant-ui/theme';
import { ProfileSection } from '../profile/profile-rows';
import { BuildCard } from './build-card';
import { putProfile } from './save';
import { ErrorLine, PrimaryButton, StepFooter } from './step-chrome';

const BUILD_TEXT = 'Build my block.';
const BUILD_LABEL = 'Build my block';
const OPEN_LABEL = 'Open the plan';
const INCOMPLETE = 'Some answers are still missing. Go back and finish the earlier steps.';
const PLAN_TAB: Href = '/(tabs)/plan';

type ServerResponse = Awaited<ReturnType<typeof serverFetch>>;
type BuildStatus = 'idle' | 'building' | 'done';

/** Every chunk is the whole reply so far, which is what the card renders. */
async function drain(response: ServerResponse, onText: (text: string) => void): Promise<void> {
  if (!response.body) {
    onText(await response.text());
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      onText(text);
    }
  } finally {
    reader.releaseLock();
  }
  const tail = decoder.decode();
  if (tail) onText(text + tail);
}

interface Build {
  readonly status: BuildStatus;
  readonly text: string;
  readonly error: string | null;
  readonly start: () => void;
}

function useBuild(profile: Profile | null): Build {
  const [status, setStatus] = useState<BuildStatus>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!profile) return;
    setStatus('building');
    setText('');
    setError(null);
    try {
      await putProfile(profile);
      const response = await serverFetch('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: BUILD_TEXT }),
      });
      if (!response.ok) throw new Error(await serverErrorMessage(response));
      await drain(response, setText);
      setStatus('done');
    } catch (cause) {
      setError(describeError(cause));
      setStatus('idle');
    }
  }, [profile]);

  const start = useCallback(() => {
    void run();
  }, [run]);

  return { status, text, error, start };
}

function jumpToField(field: ProfileField): void {
  router.setParams({ step: String(stepForField(field)) });
}

/** Unreachable while Continue gates every step, and still not a dead end if it is. */
function Incomplete() {
  const { colors } = useTheme();
  return (
    <Text style={[styles.incomplete, { color: colors.mutedForeground }]}>{INCOMPLETE}</Text>
  );
}

function AnswerRows({ profile }: { readonly profile: Profile }) {
  return (
    <>
      {ONBOARDING_STEPS.filter((step) => step.fields.length > 0).map((step) => (
        <ProfileSection
          key={step.step}
          title={step.title}
          rows={step.fields.map((field) => ({
            field,
            label: FIELD_LABELS[field],
            value: profileValue(profile, field),
          }))}
          onSelect={jumpToField}
        />
      ))}
    </>
  );
}

export function ReviewStep({
  draft,
  onBack,
}: {
  readonly draft: Draft;
  readonly onBack: (() => void) | null;
}) {
  const profile = draftProfile(draft);
  const build = useBuild(profile);

  if (build.status !== 'idle') {
    return (
      <View style={styles.building}>
        <BuildCard text={build.text} />
        {build.status === 'done' ? (
          <PrimaryButton label={OPEN_LABEL} onPress={() => router.replace(PLAN_TAB)} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.review}>
      {profile ? <AnswerRows profile={profile} /> : <Incomplete />}
      {build.error ? <ErrorLine message={build.error} onRetry={build.start} /> : null}
      <StepFooter
        onBack={onBack}
        onContinue={build.start}
        continueLabel={BUILD_LABEL}
        disabled={profile === null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  building: {
    gap: 20,
  },
  review: {
    gap: 16,
  },
  incomplete: {
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 8,
  },
});
