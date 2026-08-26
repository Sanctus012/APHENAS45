import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { generateOfficerSecureId, provisionOfficerAccount } from '../services/adminService';
import { colors, radius } from '../theme/aphenasTheme';

function generatePassword() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `Aphenas#${suffix}7`;
}

export default function AdminProvisioningScreen({ officer, authToken, onOpenChats, onLogout }) {
  const [serviceId, setServiceId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rankTitle, setRankTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [clearance, setClearance] = useState('standard');
  const [secureId, setSecureId] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState(generatePassword());
  const [loading, setLoading] = useState(false);
  const [secureIdLoading, setSecureIdLoading] = useState(false);
  const [createdOfficer, setCreatedOfficer] = useState(null);

  const normalizedServiceId = useMemo(() => serviceId.trim().toUpperCase(), [serviceId]);

  const loadSecureId = async () => {
    if (!authToken) return;
    setSecureIdLoading(true);
    try {
      const result = await generateOfficerSecureId(authToken);
      setSecureId(result.secureId || '');
    } catch (error) {
      Alert.alert('Watermark ID failed', error.message || 'Unable to generate Watermark ID.');
    } finally {
      setSecureIdLoading(false);
    }
  };

  useEffect(() => {
    loadSecureId();
  }, [authToken]);

  const submit = async () => {
    if (!normalizedServiceId || !temporaryPassword || !secureId) {
      Alert.alert('Incomplete details', 'Enter the service ID, temporary password, and Watermark ID.');
      return;
    }

    setLoading(true);
    try {
      const result = await provisionOfficerAccount(authToken, {
        serviceId: normalizedServiceId,
        temporaryPassword,
        displayName: displayName.trim(),
        rankTitle: rankTitle.trim(),
        unit: unit.trim(),
        clearance: clearance.trim() || 'standard',
        secureId,
      });
      setCreatedOfficer({ ...result.officer, temporaryPassword });
      setServiceId('');
      setDisplayName('');
      setRankTitle('');
      setUnit('');
      setClearance('standard');
      loadSecureId();
      setTemporaryPassword(generatePassword());
    } catch (error) {
      Alert.alert('Provisioning failed', error.message || 'Unable to create officer account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Image source={require('../assets/aphenas-logo.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.topBar}>
          <View>
            <Text style={styles.headerTitle}>Admin</Text>
            <Text style={styles.headerMeta}>{officer?.serviceId} • {officer?.secureId}</Text>
          </View>
        </View>

        
        <Text style={styles.title}>Create officer</Text>
        <Text style={styles.subtitle}>Provision service access with a temporary password.</Text>

        <View style={styles.field}><Text style={styles.label}>Service ID</Text><TextInput style={styles.input} value={serviceId} onChangeText={setServiceId} placeholder="NPF-000-000" placeholderTextColor="#C7C7C7" autoCapitalize="characters" autoCorrect={false} editable={!loading} /></View>
        <View style={styles.field}>
          <Text style={styles.label}>Watermark ID</Text>
          <TextInput style={styles.passwordInput} value={secureIdLoading ? 'Generating...' : secureId} placeholder="Generated ID" placeholderTextColor="#C7C7C7" editable={false} />
          <Pressable style={styles.inlineIcon} onPress={loadSecureId} disabled={loading || secureIdLoading} hitSlop={8}>
            <Feather name="refresh-cw" size={20} color={colors.green} />
          </Pressable>
        </View>
        <View style={styles.field}><Text style={styles.label}>Officer name</Text><TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor="#C7C7C7" editable={!loading} /></View>
        <View style={styles.splitRow}>
          <View style={styles.splitField}><Text style={styles.label}>Rank</Text><TextInput style={styles.input} value={rankTitle} onChangeText={setRankTitle} placeholder="ASP" placeholderTextColor="#C7C7C7" editable={!loading} /></View>
          <View style={styles.splitField}><Text style={styles.label}>Unit</Text><TextInput style={styles.input} value={unit} onChangeText={setUnit} placeholder="Division" placeholderTextColor="#C7C7C7" editable={!loading} /></View>
        </View>
        <View style={styles.field}><Text style={styles.label}>Clearance</Text><TextInput style={styles.input} value={clearance} onChangeText={setClearance} placeholder="standard" placeholderTextColor="#C7C7C7" autoCapitalize="none" editable={!loading} /></View>
        <View style={styles.field}>
          <Text style={styles.label}>Temporary password</Text>
          <TextInput style={styles.passwordInput} value={temporaryPassword} onChangeText={setTemporaryPassword} placeholder="Temporary password" placeholderTextColor="#C7C7C7" autoCapitalize="none" autoCorrect={false} editable={!loading} />
          <Pressable style={styles.inlineIcon} onPress={() => setTemporaryPassword(generatePassword())} hitSlop={8}>
            <Feather name="refresh-cw" size={20} color={colors.green} />
          </Pressable>
        </View>

        <Pressable style={[styles.button, loading && styles.disabled]} onPress={submit} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Creating…' : 'Create account'}</Text>
        </Pressable>

        {!!createdOfficer && (
          <View style={styles.resultPanel}>
            <View style={styles.resultIcon}><Feather name="check" size={18} color="#FFF" /></View>
            <Text style={styles.resultTitle}>Officer created</Text>
            <Text style={styles.resultLine}>Service ID: {createdOfficer.serviceId}</Text>
            <Text style={styles.resultLine}>Watermark ID: {createdOfficer.secureId}</Text>
            <Text style={styles.resultLine}>Temporary password: {createdOfficer.temporaryPassword}</Text>
            <Text style={styles.resultNote}>The officer must change this password on first login.</Text>
          </View>
        )}

        <Pressable style={styles.secondaryButton} onPress={onOpenChats}>
          <Feather name="message-circle" size={18} color={colors.green} />
          <Text style={styles.secondaryText}>Open chats</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 34, paddingBottom: 32 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 },
  headerTitle: { color: colors.text, fontSize: 26, fontWeight: '900' },
  headerMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 156, height: 52, alignSelf: 'center', marginBottom: 18, tintColor: colors.green },
  title: { color: colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 30 },
  field: { position: 'relative', marginBottom: 18 },
  splitRow: { flexDirection: 'row', gap: 12 },
  splitField: { flex: 1, position: 'relative', marginBottom: 18 },
  label: { position: 'absolute', left: 10, top: 8, zIndex: 1, color: '#929292', fontSize: 11 },
  input: { height: 55, paddingHorizontal: 10, paddingTop: 17, borderRadius: radius.field, backgroundColor: colors.soft, color: colors.text, fontSize: 15, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  passwordInput: { height: 55, paddingHorizontal: 10, paddingTop: 17, paddingRight: 48, borderRadius: radius.field, backgroundColor: colors.soft, color: colors.text, fontSize: 15, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  inlineIcon: { position: 'absolute', right: 12, top: 15, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  button: { height: 49, marginTop: 16, borderRadius: 27, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  resultPanel: { marginTop: 24, backgroundColor: '#FFF', borderRadius: 8, padding: 18, borderWidth: 1, borderColor: colors.line },
  resultIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  resultTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  resultLine: { color: colors.text, fontSize: 13, lineHeight: 21 },
  resultNote: { color: colors.green, fontSize: 12, fontWeight: '700', marginTop: 10 },
  secondaryButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 20 },
  secondaryText: { color: colors.green, fontSize: 13, fontWeight: '800' },
});
