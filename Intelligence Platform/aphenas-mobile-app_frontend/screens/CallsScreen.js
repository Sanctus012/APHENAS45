import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { API_URL } from '../config/api';
import { authHeaders } from '../services/apiClient';
import { colors } from '../theme/aphenasTheme';

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function callDescription(call) {
  if (call.status === 'MISSED') return 'Missed call';
  if (call.status === 'DECLINED') return 'Call declined';
  if (call.status === 'ENDED') return 'Completed call';
  if (call.status === 'ACTIVE') return 'Active call';
  return call.call_type === 'VIDEO' ? 'Video call' : 'Voice call';
}

export default function CallsScreen({ userId, authToken, onStartCall, onOpenConversation }) {
  const [calls, setCalls] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCalls = useCallback(async (mounted = () => true) => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      let response = await fetch(`${API_URL}/calls/${userId}`, {
        headers: authHeaders(authToken),
      });
      let data = await response.json();
      if (response.status === 404 && data.message === 'Route not found') {
        response = await fetch(`${API_URL}/calls?userId=${userId}`, {
          headers: authHeaders(authToken),
        });
        data = await response.json();
      }
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load calls');
      if (mounted()) setCalls(data.calls || []);
    } catch (requestError) {
      if (mounted()) {
        setError(requestError.message || 'Unable to load calls');
        setCalls([]);
      }
    } finally {
      if (mounted()) setLoading(false);
    }
  }, [authToken, userId]);

  useEffect(() => {
    let mounted = true;
    if (!userId) return undefined;
    loadCalls(() => mounted).catch(() => {});
    return () => { mounted = false; };
  }, [loadCalls, userId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return calls;
    return calls.filter((call) => `${call.participant_name} ${call.participant_service_id} ${call.status}`.toLowerCase().includes(query));
  }, [calls, search]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.header}>
        <Text style={styles.title}>Calls</Text>
      </View>
      <View style={styles.searchWrap}><Feather name="search" size={22} color="#A9A9A9" style={styles.searchIcon} /><TextInput value={search} onChangeText={setSearch} style={styles.search} placeholder="Search call log" placeholderTextColor="#B7B7B7" /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={colors.green} style={styles.loader} /> : filtered.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>{error ? 'Calls unavailable' : 'No calls yet'}</Text><Text style={styles.emptyText}>{error || 'Your recent secure calls will appear here.'}</Text>{error && <Pressable style={styles.retryButton} onPress={() => loadCalls()}><Text style={styles.retryText}>Retry</Text></Pressable>}</View> : filtered.map((call) => (
          <Pressable key={String(call.id)} style={styles.row} onPress={() => onOpenConversation?.(call)}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{String(call.participant_name || 'GR').slice(0, 2).toUpperCase()}</Text></View>
            <View style={styles.body}><View style={styles.top}><Text style={styles.name} numberOfLines={1}>{call.participant_name || call.title || 'Unknown officer'}</Text><Text style={styles.time}>{formatTime(call.created_at)}</Text></View><View style={styles.bottom}><Text style={styles.preview} numberOfLines={1}>{callDescription(call)}{call.participant_service_id ? ` • ${call.participant_service_id}` : ''}</Text><View style={[styles.statusDot, call.status === 'MISSED' && styles.missedDot]}><Text style={styles.statusMark}>{call.status === 'MISSED' ? '!' : '✓'}</Text></View></View></View>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable style={styles.fab} onPress={onStartCall}><Feather name="plus" size={30} color="#FFFFFF" /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 24, paddingTop: (StatusBar.currentHeight || 0) + 30, paddingBottom: 36 },
  title: { fontSize: 25, fontWeight: '900', color: colors.text },
  searchWrap: { marginHorizontal: 24, marginBottom: 22, height: 46, borderRadius: 23, backgroundColor: colors.soft, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  searchIcon: { marginRight: 12 },
  search: { flex: 1, color: colors.text, fontSize: 14 },
  content: { paddingHorizontal: 24, paddingBottom: 118 },
  loader: { paddingTop: 34 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 80, borderBottomWidth: 1, borderBottomColor: '#E4E4E4' },
  avatar: { width: 49, height: 49, borderRadius: 25, backgroundColor: colors.soft, borderWidth: 1, borderColor: '#E6E1E1', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: colors.text, fontWeight: '900', fontSize: 13 },
  body: { flex: 1, marginLeft: 12 },
  top: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '900' },
  time: { color: '#999', fontSize: 11, marginLeft: 8 },
  bottom: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  preview: { flex: 1, color: '#888', fontSize: 12 },
  statusDot: { width: 19, height: 19, borderRadius: 10, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  missedDot: { backgroundColor: '#A33A3A' },
  statusMark: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  empty: { paddingTop: 70, alignItems: 'center' },
  emptyTitle: { color: '#111', fontWeight: '800', fontSize: 18 },
  emptyText: { color: '#888', marginTop: 8 },
  fab: { position: 'absolute', right: 24, bottom: 28, width: 68, height: 68, borderRadius: 34, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  retryButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 18, backgroundColor: '#EAF5E7' },
  retryText: { color: colors.green, fontWeight: '800' },
});
