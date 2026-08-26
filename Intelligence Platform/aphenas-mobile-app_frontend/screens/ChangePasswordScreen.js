import React, { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { changeInitialPassword } from '../services/authService';
import { colors, radius } from '../theme/aphenasTheme';

export default function ChangePasswordScreen({ officer, onPasswordChanged }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword) return Alert.alert('Temporary Password Required', 'Enter the temporary password given to you.');
    if (!newPassword) return Alert.alert('New Password Required', 'Enter your new password.');
    if (newPassword.length < 8) return Alert.alert('Password Too Short', 'Your new password must contain at least 8 characters.');
    if (newPassword !== confirmPassword) return Alert.alert('Passwords Do Not Match', 'Please make sure both new passwords match.');
    if (newPassword === currentPassword) return Alert.alert('Choose Another Password', 'Your new password must be different from your temporary password.');

    try {
      setLoading(true);
      const onboardingToken = await AsyncStorage.getItem('onboardingToken');
      if (!onboardingToken) throw new Error('Onboarding session missing. Please login again.');
      const result = await changeInitialPassword(currentPassword, newPassword, onboardingToken);
      if (result.success) onPasswordChanged?.(result);
    } catch (error) {
      Alert.alert('Password Change Failed', error.message || 'Unable to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Image source={require('../assets/aphenas-logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Create Your Password</Text>
        <Text style={styles.subtitle}>Replace the temporary password issued by your administrator.</Text>
        <Text style={styles.officerId}>Officer ID: {officer?.serviceId}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Temporary Password</Text>
          <TextInput style={styles.input} placeholder="Enter temporary password" placeholderTextColor="#C7C7C7" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} editable={!loading} autoCapitalize="none" />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>New Password</Text>
          <TextInput style={styles.input} placeholder="Enter new password" placeholderTextColor="#C7C7C7" secureTextEntry value={newPassword} onChangeText={setNewPassword} editable={!loading} autoCapitalize="none" />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm New Password</Text>
          <TextInput style={styles.input} placeholder="Confirm new password" placeholderTextColor="#C7C7C7" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} editable={!loading} autoCapitalize="none" />
        </View>

        <Pressable style={[styles.button, loading && styles.disabled]} onPress={handleChangePassword} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Password'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 38 },
  logo: { width: 176, height: 60, alignSelf: 'center', marginBottom: 26, tintColor: colors.green },
  title: { fontSize: 31, color: colors.text, textAlign: 'center', marginBottom: 8, fontWeight: '900' },
  subtitle: { fontSize: 15, lineHeight: 20, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  officerId: { color: colors.green, fontSize: 13, textAlign: 'center', marginBottom: 30, fontWeight: '800' },
  field: { position: 'relative', marginBottom: 18 },
  label: { position: 'absolute', left: 10, top: 8, zIndex: 1, color: '#929292', fontSize: 11 },
  input: { height: 55, borderWidth: 1, borderColor: 'transparent', borderRadius: radius.field, paddingHorizontal: 10, paddingTop: 17, color: colors.text, backgroundColor: colors.soft, fontSize: 15, fontWeight: '800' },
  button: { height: 49, borderRadius: 27, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center', marginTop: 22 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
