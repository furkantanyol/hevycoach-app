import { StyleSheet, Text, View } from 'react-native';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
});

export default function Index() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>HevyCoach</Text>
    </View>
  );
}
