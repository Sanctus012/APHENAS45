import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { resetPassword } from '../services/authService';
import { colors } from '../theme/aphenasTheme';

export default function ResetPasswordScreen({ initialServiceId = '', onBack, onResetSuccess }) {
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!serviceId.trim() || !currentPassword || !newPassword) return Alert.alert('Incomplete details', 'Complete all fields before resetting your password.');
    if (newPassword.length < 8) return Alert.alert('Password too short', 'Your new password must contain at least 8 characters.');
    setLoading(true);
    try {
      const result = await resetPassword(serviceId.trim(), currentPassword, newPassword);
      if (!result.success) throw new Error(result.message || 'Unable to reset password');
      Alert.alert('Password reset', 'Your password has been updated.', [{ text: 'Continue', onPress: () => onResetSuccess?.(result) }]);
    } catch (error) {
      Alert.alert('Reset failed', error.message || 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Image source={require('../assets/aphenas-logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>Change your password to something{`\n`}unique</Text>
        <View style={styles.field}><Text style={styles.label}>Service number</Text><TextInput style={styles.input} value={serviceId} onChangeText={setServiceId} placeholder="Enter number" placeholderTextColor="#C7C7C7" autoCapitalize="characters" /></View>
        <View style={styles.field}><Text style={styles.label}>Default Password</Text><TextInput style={styles.passwordInput} value={currentPassword} onChangeText={setCurrentPassword} placeholder="Enter default password" placeholderTextColor="#C7C7C7" secureTextEntry={!showCurrent} /><Pressable style={styles.eyeButton} onPress={() => setShowCurrent((value) => !value)}><Feather name={showCurrent ? 'eye' : 'eye-off'} size={23} color={colors.text} /></Pressable></View>
        <View style={styles.field}><Text style={styles.label}>New Password</Text><TextInput style={styles.passwordInput} value={newPassword} onChangeText={setNewPassword} placeholder="Enter new password" placeholderTextColor="#C7C7C7" secureTextEntry={!showNew} /><Pressable style={styles.eyeButton} onPress={() => setShowNew((value) => !value)}><Feather name={showNew ? 'eye' : 'eye-off'} size={23} color={colors.text} /></Pressable></View>
        <Pressable style={[styles.button, loading && styles.disabled]} onPress={submit} disabled={loading}><Text style={styles.buttonText}>{loading ? 'Resetting…' : 'Reset'}</Text></Pressable>
        <Pressable style={styles.backLink} onPress={onBack}><Text style={styles.backText}>Back to login</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 58 },
  logo: { width: 176, height: 60, alignSelf: 'center', marginBottom: 26, tintColor: colors.green },
  title: { color: colors.text, fontSize: 34, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 38 },
  field: { position: 'relative', marginBottom: 38 },
  label: { position: 'absolute', left: 10, top: 9, zIndex: 1, color: '#929292', fontSize: 11 },
  input: { height: 55, paddingHorizontal: 10, paddingTop: 17, borderRadius: 5, backgroundColor: colors.soft, color: colors.text, fontSize: 16, fontWeight: '800' },
  passwordInput: { height: 55, paddingHorizontal: 10, paddingTop: 17, paddingRight: 48, borderRadius: 5, backgroundColor: colors.soft, color: colors.text, fontSize: 16, fontWeight: '800' },
  eyeButton: { position: 'absolute', right: 12, top: 15, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  button: { height: 49, marginTop: 26, borderRadius: 27, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  backLink: { alignSelf: 'center', paddingVertical: 18 },
  backText: { color: colors.green, fontWeight: '700', fontSize: 13 },
});
