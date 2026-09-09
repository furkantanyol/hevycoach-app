import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Every screen stands on the same paper, which is the only thing this has ever been asked for. */
export function ThemedView({ style, ...otherProps }: ViewProps) {
  const theme = useTheme();

  return <View style={[{ backgroundColor: theme.ground }, style]} {...otherProps} />;
}
