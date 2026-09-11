/**
 * One SF Symbol, drawn by SwiftUI. The carousel is the one place the app hosts
 * SwiftUI (never a chat bubble), and these two glyphs are the whole icon set:
 * the disclosure chevron on a card that opens and the cross that closes it.
 *
 * Not named `Symbol`: that would shadow the global the React Compiler's memo
 * cache calls (`Symbol.for`) in every module that imports it.
 */
import { Host, Image } from '@expo/ui/swift-ui';
import { View } from 'react-native';

export type SystemIconName = 'chevron.right' | 'xmark';

interface SystemIconProps {
  readonly name: SystemIconName;
  readonly size: number;
  readonly color: string;
}

/** Room around the glyph so the host never clips the symbol's own margins. */
const HOST_SLACK = 6;

/** Decorative: the text beside it carries the meaning, and it never takes the card's tap. */
export function SystemIcon({ name, size, color }: SystemIconProps) {
  const side = { width: size + HOST_SLACK, height: size + HOST_SLACK };

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={side}
    >
      <Host style={side}>
        <Image systemName={name} size={size} color={color} />
      </Host>
    </View>
  );
}
