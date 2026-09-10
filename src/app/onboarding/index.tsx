/**
 * Intake: the six steps of `ONBOARDING_STEPS`, one at a time, behind `?step=N`
 * (see `parseStep` in src/lib/onboarding-steps.ts). Continue and Back move the
 * search param rather than the stack, so the whole flow is one screen over one
 * module-level draft and the answers survive every move between steps.
 *
 * Recorded on entry, because it changes what Continue means: a step opened from
 * the Profile tab over a profile that already exists is a single-field edit, so
 * Continue saves and goes back there instead of walking the user through the
 * steps after it. A first pass has no profile yet and runs to Review.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Spacing, useTheme } from '../../components/assistant-ui/theme';
import { ReviewStep } from '../../components/onboarding/review';
import { useSaveAndReturn } from '../../components/onboarding/save';
import { ErrorLine, StepFooter, StepProgress } from '../../components/onboarding/step-chrome';
import { StepQuestions } from '../../components/onboarding/steps';
import { Screen, ScreenTitle } from '../../components/screen';
import { draftProfile, isStepComplete, seedDraft, useDraft } from '../../lib/onboarding-draft';
import { FIRST_STEP, ONBOARDING_STEPS, parseStep, REVIEW_STEP } from '../../lib/onboarding-steps';
import { describeError, serverJson } from '../../lib/server';
import type { PrefillResponse, ProfileResponse } from '../../lib/types';

const CONTINUE_LABEL = 'Continue';
const SAVE_LABEL = 'Save';
const SAVING_LABEL = 'Saving…';

interface Intake {
  readonly loading: boolean;
  readonly error: string | null;
  readonly profileExists: boolean;
  readonly retry: () => void;
}

/**
 * One read on entry, not `useServer`: that hook refetches on focus and on
 * foreground, and a second seed would throw away whatever has been typed.
 */
function useIntake(): Intake {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileExists, setProfileExists] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // A failed prefill is only a guess lost, and the steps still work empty.
        // A failed profile decides intake against edit, so it throws.
        const [{ profile }, prefill] = await Promise.all([
          serverJson<ProfileResponse>('/profile'),
          serverJson<PrefillResponse>('/prefill').catch(() => null),
        ]);
        if (cancelled) return;
        seedDraft(profile, prefill);
        setProfileExists(profile !== null);
      } catch (cause) {
        if (cancelled) return;
        setError(describeError(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return { loading, error, profileExists, retry };
}

interface FooterState {
  readonly onBack: (() => void) | null;
  readonly onContinue: () => void;
  readonly label: string;
  readonly disabled: boolean;
  readonly error: string | null;
}

function stepTitle(step: number): string {
  return ONBOARDING_STEPS.find((candidate) => candidate.step === step)?.title ?? '';
}

function continueLabel(editingOneStep: boolean, busy: boolean): string {
  if (!editingOneStep) return CONTINUE_LABEL;
  return busy ? SAVING_LABEL : SAVE_LABEL;
}

/** Review builds the block and owns its own buttons; every other step asks questions. */
function StepBody({ step, footer }: { readonly step: number; readonly footer: FooterState }) {
  const draft = useDraft();

  if (step === REVIEW_STEP) return <ReviewStep draft={draft} onBack={footer.onBack} />;

  return (
    <>
      <StepQuestions step={step} />
      <View style={styles.footer}>
        {footer.error ? <ErrorLine message={footer.error} onRetry={footer.onContinue} /> : null}
        <StepFooter
          onBack={footer.onBack}
          onContinue={footer.onContinue}
          continueLabel={footer.label}
          disabled={footer.disabled}
        />
      </View>
    </>
  );
}

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ step?: string }>();
  const step = parseStep(params.step);
  const draft = useDraft();
  const intake = useIntake();

  // Captured at mount: both answers are about how this screen was entered, and
  // moving between steps must not change either of them.
  const [openedAtAStep] = useState(() => params.step !== undefined);
  const [canReturn] = useState(() => router.canGoBack());
  const editingOneStep = intake.profileExists && openedAtAStep;

  const profile = draftProfile(draft);
  const save = useSaveAndReturn(profile);

  const goBack = useCallback(() => {
    if (step > FIRST_STEP && !editingOneStep) {
      router.setParams({ step: String(step - 1) });
      return;
    }
    router.back();
  }, [step, editingOneStep]);

  const goOn = useCallback(() => {
    if (editingOneStep) {
      save.save();
      return;
    }
    router.setParams({ step: String(step + 1) });
  }, [editingOneStep, save, step]);

  const ready = editingOneStep ? profile !== null : isStepComplete(draft, step);
  const footer: FooterState = {
    onBack: step > FIRST_STEP || canReturn ? goBack : null,
    onContinue: goOn,
    label: continueLabel(editingOneStep, save.busy),
    disabled: !ready || save.busy,
    error: save.error,
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gutter}>
          <StepProgress step={step} />
        </View>
        <ScreenTitle>{stepTitle(step)}</ScreenTitle>
        <View style={[styles.gutter, styles.body]}>
          {intake.loading ? (
            <ActivityIndicator style={styles.loading} color={colors.mutedForeground} />
          ) : null}
          {intake.error ? <ErrorLine message={intake.error} onRetry={intake.retry} /> : null}
          {intake.loading || intake.error ? null : <StepBody step={step} footer={footer} />}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: 24,
    paddingTop: 4,
  },
  gutter: {
    paddingHorizontal: Spacing.gutter,
  },
  body: {
    flexGrow: 1,
    paddingTop: 16,
  },
  loading: {
    paddingVertical: 32,
  },
  footer: {
    gap: 12,
    marginTop: 'auto',
    paddingTop: 8,
  },
});
