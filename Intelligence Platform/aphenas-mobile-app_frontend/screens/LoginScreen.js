import React, { useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { loginOfficer } from '../services/authService';
import { colors } from '../theme/aphenasTheme';

export default function LoginScreen({ onLoginSuccess, onResetPassword }) {
  const [serviceId, setServiceId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);

  const handleLogin = async () => {
    const cleanServiceId = serviceId.trim();
    if (!cleanServiceId || !password) {
      Alert.alert('Incomplete details', 'Enter your service number and default password.');
      return;
    }
    setLoading(true);
    try {
      const result = await loginOfficer(cleanServiceId, password);
      if (!result.success || !result.credentialsVerified) throw new Error('Unable to verify your credentials.');
      if (result.onboardingToken) await AsyncStorage.setItem('onboardingToken', result.onboardingToken);
      if (result.authToken) await AsyncStorage.setItem('authToken', result.authToken);
      if (result.refreshToken) await AsyncStorage.setItem('refreshToken', result.refreshToken);
      onLoginSuccess?.(result);
    } catch (error) {
      Alert.alert('Login failed', error.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Image source={require('../assets/aphenas-logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>Please input your details to{`\n`}successfully register</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Service number</Text>
          <TextInput
            style={styles.input}
            value={serviceId}
            onChangeText={setServiceId}
            placeholder="Enter number"
            placeholderTextColor="#C7C7C7"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!loading}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Default Password</Text>
          <TextInput
            ref={passwordRef}
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter default password"
            placeholderTextColor="#C7C7C7"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          <Pressable style={styles.eyeButton} onPress={() => setShowPassword((value) => !value)} hitSlop={8}>
            <Feather name={showPassword ? 'eye' : 'eye-off'} size={23} color={colors.text} />
          </Pressable>
        </View>

        <Pressable style={[styles.loginButton, loading && styles.disabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.loginText}>{loading ? 'Signing in…' : 'Login'}</Text>
        </Pressable>
        <Pressable style={styles.resetLink} onPress={onResetPassword} disabled={loading}><Text style={styles.resetText}>Reset password</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 58, paddingBottom: 35 },
  logo: { width: 176, height: 60, alignSelf: 'center', marginBottom: 26, tintColor: colors.green },
  title: { color: colors.text, fontSize: 31, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 38 },
  field: { position: 'relative', marginBottom: 38 },
  label: { position: 'absolute', left: 10, top: 9, zIndex: 1, color: '#929292', fontSize: 11 },
  input: { height: 55, paddingHorizontal: 10, paddingTop: 17, borderRadius: 5, backgroundColor: colors.soft, color: colors.text, fontSize: 16, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  passwordInput: { height: 55, paddingHorizontal: 10, paddingTop: 17, paddingRight: 48, borderRadius: 5, backgroundColor: colors.soft, color: colors.text, fontSize: 16, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  eyeButton: { position: 'absolute', right: 12, top: 15, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  loginButton: { height: 49, marginTop: 86, borderRadius: 27, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center' },
  loginText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  resetLink: { alignSelf: 'center', paddingVertical: 18 },
  resetText: { color: colors.green, fontSize: 13, fontWeight: '700' },
});
