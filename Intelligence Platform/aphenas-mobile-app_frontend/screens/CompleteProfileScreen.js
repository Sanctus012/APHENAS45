import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/aphenasTheme';

export default function CompleteProfileScreen({ officer, onProfileCompleted }) {
  const continueProfile = () => {
    onProfileCompleted?.({ officer });
  };

  return (
    <View style={styles.container}>
      <Image source={require('../assets/aphenas-logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>Complete Your Profile</Text>
      <Text style={styles.subtitle}>Your officer profile details are required before accessing the secure platform.</Text>
      <Text style={styles.officer}>Officer ID: {officer?.serviceId}</Text>
      <Pressable style={styles.button} onPress={continueProfile}>
        <Text style={styles.buttonText}>Continue</Text>
        <Feather name="arrow-right" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', paddingHorizontal: 24 },
  logo: { width: 176, height: 60, alignSelf: 'center', marginBottom: 30, tintColor: colors.green },
  title: { color: colors.text, fontSize: 31, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  subtitle: { color: colors.muted, textAlign: 'center', fontSize: 15, lineHeight: 21, marginBottom: 28 },
  officer: { color: colors.green, textAlign: 'center', marginBottom: 40, fontSize: 13, fontWeight: '800' },
  button: { height: 49, backgroundColor: colors.green, borderRadius: 27, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 9 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});
