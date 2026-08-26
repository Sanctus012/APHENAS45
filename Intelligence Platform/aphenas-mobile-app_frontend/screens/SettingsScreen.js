
import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { setChatPin, verifyChatPin } from '../services/chatPinService';
import { colors } from '../theme/aphenasTheme';
import { usePreferences } from '../context/PreferencesContext';
 
export default function SettingsScreen({ officer, onLogout }) {
  // --- Chat Lock: two-step flow (verify old PIN, then set new PIN) ---
  const [step, setStep] = useState('verify'); // 'verify' | 'change'
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pinError, setPinError] = useState('');
 
  const userId = officer?.userId || officer?.id;
 
  const resetPinFlow = () => {
    setStep('verify');
    setOldPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError('');
  };
 
  const handleVerifyOldPin = async () => {
    setPinError('');
    if (!/^\d{6}$/.test(oldPin)) return setPinError('Enter your current 6-digit PIN.');
    setVerifying(true);
    try {
      await verifyChatPin(userId, oldPin, officer?.authToken);
      setStep('change');
    } catch (error) {
      setPinError(error.message || 'That PIN was not recognized.');
    } finally {
      setVerifying(false);
    }
  };
 
  const handleSaveNewPin = async () => {
    setPinError('');
    if (!/^\d{6}$/.test(newPin)) return setPinError('New PIN must be exactly 6 digits.');
    if (newPin !== confirmPin) return setPinError('The new PINs do not match.');
    if (newPin === oldPin) return setPinError('New PIN must be different from your current PIN.');
    setSaving(true);
    try {
      await setChatPin(userId, newPin, officer?.authToken);
      Alert.alert('Chat PIN updated', 'Your secure chat PIN has been changed.');
      resetPinFlow();
    } catch (error) {
      setPinError(error.message || 'Unable to update Chat PIN.');
    } finally {
      setSaving(false);
    }
  };
 
  // --- Appearance & behavior preferences ---
  const {
    fontScaleIndex,
    fontScaleSteps,
    increaseFontSize,
    decreaseFontSize,
    themeMode,
    toggleTheme,
    enterToSend,
    setEnterToSend,
  } = usePreferences();
 
  const isDark = themeMode === 'dark';
  const fontScalePercent = Math.round((fontScaleSteps[fontScaleIndex] ?? 1) * 100);
 
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        {!!officer?.serviceId && <Text style={styles.serviceId}>{officer.serviceId}</Text>}
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Profile</Text>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{officer?.displayName || officer?.serviceId || 'Officer'}</Text>
        <Text style={styles.label}>Service number</Text>
        <Text style={styles.value}>{officer?.serviceId}</Text>
        <Text style={styles.label}>Rank / Unit</Text>
        <Text style={styles.value}>{officer?.rank || 'Unassigned'}{officer?.unit ? ` · ${officer.unit}` : ''}</Text>
      </View>
 
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Appearance</Text>
 
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Text size</Text>
            <Text style={styles.help}>{fontScalePercent}% of default size</Text>
          </View>
          <View style={styles.stepper}>
            <Pressable
              style={[styles.stepperBtn, fontScaleIndex === 0 && styles.stepperBtnDisabled]}
              onPress={decreaseFontSize}
              disabled={fontScaleIndex === 0}
            >
              <Text style={styles.stepperBtnText}>A-</Text>
            </Pressable>
            <Pressable
              style={[styles.stepperBtn, fontScaleIndex === fontScaleSteps.length - 1 && styles.stepperBtnDisabled]}
              onPress={increaseFontSize}
              disabled={fontScaleIndex === fontScaleSteps.length - 1}
            >
              <Text style={styles.stepperBtnText}>A+</Text>
            </Pressable>
          </View>
        </View>
 
        <View style={[styles.rowBetween, { marginTop: 18 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Dark mode</Text>
            <Text style={styles.help}>{isDark ? 'Dark theme is on' : 'Light theme is on'}</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.line, true: colors.green }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>
 
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Chat behavior</Text>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Enter key sends message</Text>
            <Text style={styles.help}>When off, Enter adds a new line and you tap send instead.</Text>
          </View>
          <Switch
            value={enterToSend}
            onValueChange={setEnterToSend}
            trackColor={{ false: colors.line, true: colors.green }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>
 
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Chat Lock</Text>
 
        {step === 'verify' && (
          <>
            <Text style={styles.help}>Enter your current PIN to change your Chat PIN.</Text>
            <TextInput
              style={styles.input}
              value={oldPin}
              onChangeText={(value) => { setOldPin(value.replace(/\D/g, '').slice(0, 6)); setPinError(''); }}
              placeholder="Current 6-digit PIN"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            {!!pinError && <Text style={styles.error}>{pinError}</Text>}
            <Pressable style={[styles.button, verifying && styles.disabled]} onPress={handleVerifyOldPin} disabled={verifying}>
              <Text style={styles.buttonText}>{verifying ? 'Checking...' : 'Continue'}</Text>
            </Pressable>
          </>
        )}
 
        {step === 'change' && (
          <>
            <Text style={styles.help}>Current PIN verified. Enter your new 6-digit PIN.</Text>
            <TextInput
              style={styles.input}
              value={newPin}
              onChangeText={(value) => { setNewPin(value.replace(/\D/g, '').slice(0, 6)); setPinError(''); }}
              placeholder="New 6-digit PIN"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            <TextInput
              style={styles.input}
              value={confirmPin}
              onChangeText={(value) => { setConfirmPin(value.replace(/\D/g, '').slice(0, 6)); setPinError(''); }}
              placeholder="Confirm new PIN"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            {!!pinError && <Text style={styles.error}>{pinError}</Text>}
            <Pressable style={[styles.button, saving && styles.disabled]} onPress={handleSaveNewPin} disabled={saving}>
              <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Change PIN'}</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={resetPinFlow} disabled={saving}>
              <Text style={styles.linkBtnText}>Cancel</Text>
            </Pressable>
          </>
        )}
 
        <Text style={styles.help}>Default unlock period: 7 days when no validity period is selected. Duress code management is pending operational approval.</Text>
      </View>
 
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Notifications</Text>
        <Text style={styles.help}>Notification preferences will appear here when push delivery is connected.</Text>
      </View>
 
      <Pressable style={styles.logout} onPress={onLogout}>
        <Feather name="log-out" size={18} color="#A43C3C" />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}
 
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, paddingBottom: 118 },
  header: { paddingTop: (StatusBar.currentHeight || 0) + 30, paddingBottom: 36 },
  logo: { width: 150, height: 50, alignSelf: 'center', tintColor: colors.green, marginBottom: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', marginBottom: 18 },
  serviceId: { color: colors.muted, fontSize: 11, marginTop: -12, fontWeight: '700' },
  panel: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  panelTitle: { color: colors.green, fontSize: 17, fontWeight: '900', marginBottom: 12 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 8 },
  value: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 3 },
  help: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  input: { height: 46, borderRadius: 8, backgroundColor: colors.soft, color: colors.text, paddingHorizontal: 14, marginTop: 14, textAlign: 'center', letterSpacing: 5, fontWeight: '900' },
  button: { height: 42, borderRadius: 21, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  buttonText: { color: '#FFF', fontWeight: '900' },
  disabled: { opacity: 0.6 },
  error: { color: '#A33A3A', fontSize: 12, marginTop: 10, textAlign: 'center' },
  linkBtn: { alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 6 },
  linkBtnText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  stepper: { flexDirection: 'row', gap: 8 },
  stepperBtn: { width: 44, height: 36, borderRadius: 8, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperBtnText: { color: colors.green, fontWeight: '900', fontSize: 13 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  logoutText: { color: '#A43C3C', fontWeight: '900' },
});
 
