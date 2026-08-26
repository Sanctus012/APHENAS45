import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { acknowledgeBroadcast, getBroadcasts, getSitreps, sendBroadcast, sendSitrep } from '../services/signalService';
import { getGroups } from '../services/conversationService';
import { colors } from '../theme/aphenasTheme';

const STATUSES = ['GREEN', 'AMBER', 'RED'];
const EMPTY_GROUPS = [];

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusStyle(status) {
  if (status === 'RED') return styles.redChip;
  if (status === 'AMBER') return styles.amberChip;
  return styles.greenChip;
}

async function currentLocation() {
  if (!global.navigator?.geolocation) return {};
  return new Promise((resolve) => {
    global.navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );
  });
}

export default function SignalScreen({ officer, groups = EMPTY_GROUPS, onOpenGroups }) {
  const authToken = officer?.authToken;
  const userId = officer?.userId || officer?.id;
  const isAdmin = officer?.role === 'admin';
  const [status, setStatus] = useState('GREEN');
  const [filter, setFilter] = useState('');
  const [note, setNote] = useState('');
  const [targetConversationId, setTargetConversationId] = useState('');
  const [sitreps, setSitreps] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [availableGroups, setAvailableGroups] = useState(groups);
  const [broadcastBody, setBroadcastBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sitrepData, broadcastData, groupData] = await Promise.all([
        getSitreps(authToken, filter),
        getBroadcasts(authToken),
        userId ? getGroups(userId, authToken).catch(() => ({ groups })) : Promise.resolve({ groups }),
      ]);
      setSitreps(sitrepData.sitreps || []);
      setBroadcasts(broadcastData.broadcasts || []);
      setAvailableGroups(groupData.groups || groups);
    } catch (error) {
      Alert.alert('Signal unavailable', error.message || 'Unable to load Signal.');
    } finally {
      setLoading(false);
    }
  }, [authToken, filter, groups, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!targetConversationId && availableGroups[0]?.id) setTargetConversationId(String(availableGroups[0].id));
  }, [availableGroups, targetConversationId]);

  const lastSignalAt = useMemo(() => sitreps[0]?.created_at || null, [sitreps]);

  const submitSitrep = async () => {
    if (!targetConversationId) return Alert.alert('Select group', 'Choose a command group before sending a SITREP.');
    setSending(true);
    try {
      const location = await currentLocation();
      await sendSitrep(authToken, {
        conversationId: targetConversationId || null,
        status,
        note,
        ...location,
      });
      setNote('');
      await load();
    } catch (error) {
      Alert.alert('SITREP failed', error.message || 'Unable to send SITREP.');
    } finally {
      setSending(false);
    }
  };

  const submitBroadcast = async () => {
    if (!targetConversationId) return Alert.alert('Select group', 'Choose a command group before sending a broadcast.');
    if (!broadcastBody.trim()) return Alert.alert('Broadcast required', 'Enter the command message.');
    setSending(true);
    try {
      await sendBroadcast(authToken, {
        conversationId: targetConversationId,
        title: 'Priority command',
        body: broadcastBody,
        priority: 'HIGH',
      });
      setBroadcastBody('');
      await load();
    } catch (error) {
      Alert.alert('Broadcast failed', error.message || 'Unable to send broadcast.');
    } finally {
      setSending(false);
    }
  };

  const ack = async (broadcastId) => {
    try {
      await acknowledgeBroadcast(authToken, broadcastId);
      await load();
    } catch (error) {
      Alert.alert('Acknowledgment failed', error.message || 'Unable to acknowledge broadcast.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.header}>
        <Text style={styles.title}>Signal</Text>
        {!!officer?.serviceId && <Text style={styles.serviceId}>{officer.serviceId}</Text>}
      </View>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Last signal</Text>
        <Text style={styles.summaryValue}>{lastSignalAt ? formatTime(lastSignalAt) : 'No SITREP yet'}</Text>
      </View>

      <Text style={styles.sectionTitle}>One-tap SITREP</Text>
      <View style={styles.chipRow}>
        {STATUSES.map((item) => (
          <Pressable key={item} style={[styles.chip, statusStyle(item), status === item && styles.activeChip]} onPress={() => setStatus(item)}>
            <Text style={styles.chipText}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Optional note" placeholderTextColor="#999" />
      <View style={styles.groupRow}>
        <Text style={styles.groupText}>{availableGroups.find((group) => String(group.id) === String(targetConversationId))?.name || 'No command group selected'}</Text>
        <Pressable onPress={onOpenGroups}><Text style={styles.groupAction}>Groups</Text></Pressable>
      </View>
      <Pressable style={[styles.primaryButton, sending && styles.disabled]} onPress={submitSitrep} disabled={sending}>
        <Feather name="send" size={17} color="#FFF" />
        <Text style={styles.primaryText}>{sending ? 'Sending...' : 'Send SITREP'}</Text>
      </Pressable>

      {isAdmin && (
        <>
          <Text style={styles.sectionTitle}>Command Broadcast</Text>
          <TextInput style={[styles.input, styles.broadcastInput]} value={broadcastBody} onChangeText={setBroadcastBody} placeholder="Priority message requiring acknowledgment" placeholderTextColor="#999" multiline />
          <Pressable style={[styles.secondaryButton, sending && styles.disabled]} onPress={submitBroadcast} disabled={sending}>
            <Text style={styles.secondaryText}>Send broadcast</Text>
          </Pressable>
        </>
      )}

      <View style={styles.filterRow}>
        <Text style={styles.sectionTitle}>Signal Feed</Text>
        <Pressable onPress={() => setFilter(filter ? '' : status)}>
          <Text style={styles.filterText}>{filter ? `Filter: ${filter}` : 'All'}</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={colors.green} style={styles.loader} /> : (
        <>
          {broadcasts.map((item) => (
            <View key={`broadcast-${item.id}`} style={styles.broadcastCard}>
              <Text style={styles.broadcastTitle}>{item.title}</Text>
              <Text style={styles.broadcastBody}>{item.body}</Text>
              <Text style={styles.meta}>{item.acknowledged_count}/{item.total_recipients} acknowledged{item.escalated ? ' · overdue' : ''}</Text>
              {!item.acknowledged_at && Number(item.sender_id) !== Number(officer?.userId || officer?.id) && (
                <Pressable style={styles.ackButton} onPress={() => ack(item.id)}>
                  <Text style={styles.ackText}>Acknowledge</Text>
                </Pressable>
              )}
            </View>
          ))}
          {sitreps.map((item) => (
            <View key={`sitrep-${item.id}`} style={styles.feedRow}>
              <View style={[styles.statusDot, statusStyle(item.status)]} />
              <View style={styles.feedBody}>
                <Text style={styles.feedTitle}>{item.status} · {item.sender_name}</Text>
                <Text style={styles.body}>{item.note || 'No note'}</Text>
                <Text style={styles.meta}>{formatTime(item.created_at)}{item.latitude ? ` · ${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}` : ''}</Text>
              </View>
            </View>
          ))}
          {!broadcasts.length && !sitreps.length && <Text style={styles.empty}>No signal activity yet.</Text>}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, paddingBottom: 118 },
  header: { paddingTop: (StatusBar.currentHeight || 0) + 30, paddingBottom: 36 },
  title: { fontSize: 25, fontWeight: '900', color: colors.text },
  serviceId: { color: colors.muted, fontSize: 11, marginTop: 5, fontWeight: '700' },
  summary: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: colors.line, marginBottom: 18 },
  summaryLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  summaryValue: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 5 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: { flex: 1, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
  activeChip: { opacity: 1, borderWidth: 2, borderColor: colors.text },
  greenChip: { backgroundColor: colors.green },
  amberChip: { backgroundColor: '#D99A16' },
  redChip: { backgroundColor: '#B83232' },
  chipText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  input: { minHeight: 46, borderRadius: 8, backgroundColor: colors.soft, color: colors.text, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12 },
  broadcastInput: { minHeight: 84, textAlignVertical: 'top' },
  groupRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  groupText: { flex: 1, color: colors.muted, fontSize: 12 },
  groupAction: { color: colors.green, fontSize: 12, fontWeight: '900' },
  primaryButton: { height: 46, borderRadius: 23, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 26 },
  primaryText: { color: '#FFF', fontWeight: '900' },
  secondaryButton: { height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.green, justifyContent: 'center', alignItems: 'center', marginBottom: 26 },
  secondaryText: { color: colors.green, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterText: { color: colors.green, fontSize: 12, fontWeight: '900' },
  loader: { marginTop: 20 },
  broadcastCard: { backgroundColor: '#161616', borderRadius: 6, padding: 13, marginBottom: 12 },
  broadcastTitle: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  broadcastBody: { color: '#F3F3F3', fontSize: 13, lineHeight: 18, marginTop: 4 },
  body: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 4 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 6 },
  ackButton: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: colors.green, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  ackText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  feedRow: { flexDirection: 'row', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  feedBody: { flex: 1, marginLeft: 10 },
  feedTitle: { color: colors.text, fontWeight: '900', fontSize: 13 },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 28 },
});
