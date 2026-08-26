import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { API_URL, NGROK_SKIP_BROWSER_WARNING_HEADER } from '../config/api';
import { generateRecoveryPhrase } from '../services/recoveryService';
import { getDeviceId } from '../services/deviceService';
import { colors } from '../theme/aphenasTheme';

export default function RecoveryPhraseScreen({ onRecoveryCompleted }) {
  const [phrase, setPhrase] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    loadPhrase();
  }, []);

  const loadPhrase = async () => {
    try {
      const token = await AsyncStorage.getItem('onboardingToken');
      if (!token) throw new Error('Onboarding session expired. Login again.');
      const result = await generateRecoveryPhrase(token);
      if (result.success && result.recoveryPhrase) setPhrase(result.recoveryPhrase.split(' '));
    } catch (error) {
      Alert.alert('Recovery Setup Failed', error.message || 'Unable to generate recovery phrase.');
    } finally {
      setLoading(false);
    }
  };

  const confirmPhrase = async () => {
    try {
      setConfirming(true);
      const token = await AsyncStorage.getItem('onboardingToken');
      if (!token) throw new Error('Onboarding session expired.');
      const deviceId = await getDeviceId();

      const response = await fetch(`${API_URL}/onboarding/recovery/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...NGROK_SKIP_BROWSER_WARNING_HEADER,
          Authorization: `Bearer ${token}`,
          'X-Aphenas-Device-Id': deviceId,
        },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Unable to confirm recovery phrase.');
      if (result.authToken) {
        await AsyncStorage.setItem('authToken', result.authToken);
      }
      if (result.refreshToken) {
        await AsyncStorage.setItem('refreshToken', result.refreshToken);
      }
      await AsyncStorage.removeItem('onboardingToken');
      onRecoveryCompleted?.(result);
    } catch (error) {
      Alert.alert('Confirmation Failed', error.message || 'Unable to confirm recovery phrase.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingWrap}>
          <Image source={require('../assets/aphenas-logo.png')} style={styles.loadingLogo} resizeMode="contain" />
          <ActivityIndicator color={colors.green} />
          <Text style={styles.loading}>Generating recovery phrase...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={require('../assets/aphenas-logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Your Recovery Phrase</Text>
        <Text style={styles.warning}>Write these 12 words down and keep them secure. They are the only way to recover your account.</Text>

        <View style={styles.phraseBox}>
          {phrase.map((word, index) => (
            <View key={`${word}-${index}`} style={styles.wordRow}>
              <Text style={styles.number}>{index + 1}</Text>
              <Text style={styles.word}>{word}</Text>
            </View>
          ))}
        </View>

        <Pressable style={[styles.button, confirming && styles.disabled]} disabled={confirming} onPress={confirmPhrase}>
          <Text style={styles.buttonText}>{confirming ? 'Confirming...' : 'I Have Saved My Phrase'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 42, paddingBottom: 46 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18, paddingHorizontal: 24 },
  loadingLogo: { width: 176, height: 60, tintColor: colors.green },
  loading: { color: colors.muted, textAlign: 'center', fontSize: 14 },
  logo: { width: 176, height: 60, alignSelf: 'center', marginBottom: 34, tintColor: colors.green },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', marginBottom: 12 },
  warning: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 25 },
  phraseBox: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 15, marginBottom: 30, borderWidth: 1, borderColor: colors.line },
  wordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  number: { width: 35, color: colors.muted, fontWeight: '700' },
  word: { color: colors.text, fontSize: 16, fontWeight: '800' },
  button: { minHeight: 49, backgroundColor: colors.green, borderRadius: 27, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, textAlign: 'center' },
  disabled: { opacity: 0.6 },
});
