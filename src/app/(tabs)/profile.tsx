/**
 * Everything the coach knows about the user, one row per field, grouped by the
 * intake step that owns it. A row is the way back into that step. The button at
 * the foot asks the coach, in the thread's own words, to write a new block from
 * what is on this screen.
 */
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing, useTheme } from '../../components/assistant-ui/theme';
import { ProfileSection } from '../../components/profile/profile-rows';
import { InlineError, Screen, ScreenTitle } from '../../components/screen';
import { ONBOARDING_STEPS, stepForField, type ProfileField } from '../../lib/onboarding-steps';
import { FIELD_LABELS, profileValue } from '../../lib/options';
import {
  describeError,
  serverErrorMessage,
  serverFetch,
  serverHost,
  useServer,
} from '../../lib/server';
import type { Profile, ProfileResponse } from '../../lib/types';

const REBUILD_TEXT = 'Rebuild my block with my current profile.';
const REBUILD_LABEL = 'Rebuild block';
const REBUILD_BUSY_LABEL = 'Building your block…';
const EMPTY_LINE = 'The coach has nothing about you yet.';
const SETUP_LABEL = 'Start setup';
const BUTTON_PRESSED_OPACITY = 0.7;
const COACH_TAB: Href = '/(tabs)/coach';
const ONBOARDING: Href = '/onboarding';

function openStep(step: number) {
  router.push({ pathname: '/onboarding', params: { step: String(step) } });
}

function openField(field: ProfileField) {
  openStep(stepForField(field));
}

function AccentButton({
  label,
  busy = false,
  onPress,
}: {
  readonly label: string;
  readonly busy?: boolean;
  readonly onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.accent },
        (pressed || busy) && { opacity: BUTTON_PRESSED_OPACITY },
      ]}
    >
      {busy ? <ActivityIndicator color={colors.accentForeground} /> : null}
      <Text style={[styles.buttonLabel, { color: colors.accentForeground }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The plan is built through the chat, so a rebuild is a message like any other.
 * The reply streams as text/plain; draining the whole body is what waits for
 * the block to be written, and only then is there anything to read on Coach.
 */
function useRebuild() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rebuild = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await serverFetch('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: REBUILD_TEXT }),
      });
      if (!response.ok) throw new Error(await serverErrorMessage(response));
      await response.text();
      router.navigate(COACH_TAB);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const start = useCallback(() => {
    void rebuild();
  }, [rebuild]);

  return { busy, error, start };
}

function ProfileSections({ profile }: { readonly profile: Profile }) {
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
          onSelect={openField}
        />
      ))}
    </>
  );
}

function EmptyProfile() {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyLine, { color: colors.mutedForeground }]}>{EMPTY_LINE}</Text>
      <AccentButton label={SETUP_LABEL} onPress={() => router.push(ONBOARDING)} />
    </View>
  );
}

function ProfileBody({
  profile,
  loading,
  error,
}: {
  readonly profile: Profile | null;
  readonly loading: boolean;
  readonly error: string | null;
}) {
  const { colors } = useTheme();
  if (profile) return <ProfileSections profile={profile} />;
  if (loading) return <ActivityIndicator style={styles.loading} color={colors.mutedForeground} />;
  if (error) return <InlineError>{error}</InlineError>;
  return <EmptyProfile />;
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { data, error, loading } = useServer<ProfileResponse>('/profile');
  const rebuild = useRebuild();
  const profile = data?.profile ?? null;

  return (
    <Screen>
      <ScreenTitle>Profile</ScreenTitle>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {profile && error ? <InlineError>{error}</InlineError> : null}
        <ProfileBody profile={profile} loading={loading} error={error} />
        {rebuild.error ? <InlineError>{rebuild.error}</InlineError> : null}
        {profile ? (
          <AccentButton
            label={rebuild.busy ? REBUILD_BUSY_LABEL : REBUILD_LABEL}
            busy={rebuild.busy}
            onPress={rebuild.start}
          />
        ) : null}
        <Text style={[styles.footer, { color: colors.mutedForeground }]}>{serverHost}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
    paddingHorizontal: Spacing.gutter,
    paddingTop: 12,
  },
  loading: {
    paddingVertical: 32,
  },
  empty: {
    gap: 16,
    paddingVertical: 24,
  },
  emptyLine: {
    fontSize: 16,
    lineHeight: 22,
  },
  button: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    fontSize: 13,
    paddingTop: 20,
    textAlign: 'center',
  },
});
