import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { setChatPin } from '../services/chatPinService';

const GREEN = '#0E6505';

export default function ChatPINSetupScreen({ officer, onComplete }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const createPIN = async () => {
    setError('');
    if (!/^\d{6}$/.test(pin)) return setError('Your PIN must contain exactly 6 digits.');
    if (pin !== confirmPin) return setError('The PINs do not match.');
    const userId = Number(officer?.userId || officer?.id || 0);
    if (!userId) return setError('Your officer session is unavailable. Please sign in again.');
    setLoading(true);
    try {
      await setChatPin(userId, pin, officer?.authToken);
      onComplete?.(pin);
    } catch (requestError) {
      Alert.alert('Chat PIN setup failed', requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('../assets/aphenas-logo.png')} style={styles.logo} resizeMode="contain" />
      <View style={styles.iconCircle}><Text style={styles.lockIcon}>▣</Text></View>
      <Text style={styles.title}>Create Chat PIN</Text>
      <Text style={styles.description}>Your Chat PIN protects your conversations.{`\n`}You will need it to unlock protected messages.</Text>
      <Text style={styles.label}>Create PIN</Text>
      <TextInput style={styles.input} value={pin} onChangeText={(value) => { setPin(value.replace(/\D/g, '')); setError(''); }} placeholder="Enter 6-digit PIN" placeholderTextColor="#A0A0A0" keyboardType="number-pad" secureTextEntry maxLength={6} />
      <Text style={styles.label}>Confirm PIN</Text>
      <TextInput style={styles.input} value={confirmPin} onChangeText={(value) => { setConfirmPin(value.replace(/\D/g, '')); setError(''); }} placeholder="Re-enter your PIN" placeholderTextColor="#A0A0A0" keyboardType="number-pad" secureTextEntry maxLength={6} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, loading && styles.disabled]} onPress={createPIN} disabled={loading}><Text style={styles.buttonText}>{loading ? 'Saving…' : 'Create Chat PIN'}</Text></Pressable>
      <Text style={styles.securityNote}>Keep your Chat PIN private. Aphenas will never ask you to share it with another user.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FFF9', paddingHorizontal: 25, justifyContent: 'center' },
  logo: { width: 176, height: 60, alignSelf: 'center', marginBottom: 20, tintColor: GREEN },
  iconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 22 },
  lockIcon: { fontSize: 27, color: '#FFF' },
  title: { color: '#244D1F', fontSize: 27, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  description: { color: '#777', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 28 },
  label: { color: '#222', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { height: 52, borderRadius: 10, borderWidth: 1, borderColor: '#E1E1E1', backgroundColor: '#FFF', paddingHorizontal: 15, fontSize: 20, color: '#111', textAlign: 'center', letterSpacing: 8, marginBottom: 16 },
  error: { color: '#A33A3A', fontSize: 12, textAlign: 'center', marginBottom: 14 },
  button: { height: 52, backgroundColor: GREEN, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  securityNote: { marginTop: 24, fontSize: 11, color: '#777', textAlign: 'center', lineHeight: 17 },
});
