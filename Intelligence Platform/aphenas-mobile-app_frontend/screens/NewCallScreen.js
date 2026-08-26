import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { API_URL } from '../config/api';
import { authHeaders } from '../services/apiClient';
import socket from '../services/socketService';
import { colors, initials } from '../theme/aphenasTheme';

function userIdFromOfficer(officer) {
  return Number(officer?.userId || officer?.id || 0);
}

function officerName(user) {
  return user.name || user.display_name || user.service_id || `Officer ${user.id}`;
}

export default function NewCallScreen({ officer, navigation }) {
  const currentUserId = userIdFromOfficer(officer);
  const authToken = officer?.authToken;
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await fetch(`${API_URL}/users`, {
          headers: authHeaders(authToken),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load officers');
        if (mounted) setUsers((data.users || []).filter((user) => Number(user.id) !== currentUserId));
      } catch (error) {
        Alert.alert('Unable to load officers', error.message || 'Try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [authToken, currentUserId]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => `${user.name} ${user.display_name} ${user.service_id} ${user.rank} ${user.unit}`.toLowerCase().includes(query));
  }, [search, users]);

  const startCall = async (user) => {
    if (!currentUserId) {
      Alert.alert('Session unavailable', 'Please sign in again before starting a call.');
      return;
    }

    setStartingId(user.id);
    try {
      const conversationResponse = await fetch(`${API_URL}/conversations/direct`, {
        method: 'POST',
        headers: authHeaders(authToken),
        body: JSON.stringify({ userId: currentUserId, participantId: user.id }),
      });
      const conversationData = await conversationResponse.json();
      if (!conversationResponse.ok || !conversationData.success) {
        throw new Error(conversationData.message || 'Unable to prepare secure call.');
      }

      const callResponse = await fetch(`${API_URL}/calls`, {
        method: 'POST',
        headers: authHeaders(authToken),
        body: JSON.stringify({ conversationId: conversationData.conversationId, callType: 'AUDIO' }),
      });
      const callData = await callResponse.json();
      if (!callResponse.ok || !callData.success) throw new Error(callData.message || 'Unable to start call');

      const participant = conversationData.participant || {};
      const name = participant.name || officerName(user);
      const callPayload = {
        conversationId: conversationData.conversationId,
        callId: callData.call.id,
        callType: callData.call.call_type,
        status: callData.call.status || 'RINGING',
      };

      if (!socket.connected) socket.connect();
      socket.emit('callInvite', callPayload);

      navigation.navigate('ActiveCall', {
        call: callPayload,
        participant: {
          id: participant.id || user.id,
          name,
          serviceId: participant.serviceId || user.service_id,
          rank: participant.rank || user.rank,
          unit: participant.unit || user.unit,
        },
      });
    } catch (error) {
      Alert.alert('Call unavailable', error.message || 'Unable to start call.');
    } finally {
      setStartingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={8}>
          <Feather name="arrow-left" size={25} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>New Call</Text>
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={22} color="#A9A9A9" style={styles.searchIcon} />
        <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search officers" placeholderTextColor="#A5A5A5" />
      </View>

      <Text style={styles.sectionTitle}>Available Officers</Text>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={colors.green} style={styles.loader} /> : filteredUsers.length === 0 ? (
          <Text style={styles.empty}>No officers found.</Text>
        ) : filteredUsers.map((user) => {
          const name = officerName(user);
          const starting = startingId === user.id;
          return (
            <Pressable key={String(user.id)} style={styles.contact} onPress={() => startCall(user)} disabled={starting}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(name, 'CO')}</Text></View>
              <View style={styles.contactBody}>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.meta}>{user.service_id}{user.rank ? ` • ${user.rank}` : ''}</Text>
              </View>
              {starting ? <ActivityIndicator color={colors.green} /> : <Feather name="phone" size={23} color={colors.green} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { height: 58 + (StatusBar.currentHeight || 0), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: StatusBar.currentHeight || 0 },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 25, fontWeight: '900', marginLeft: 4 },
  searchWrap: { marginHorizontal: 24, marginBottom: 22, height: 46, borderRadius: 24, backgroundColor: colors.soft, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  searchIcon: { marginRight: 12 },
  search: { flex: 1, color: colors.text, fontSize: 14 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900', paddingHorizontal: 24, paddingBottom: 8 },
  content: { paddingHorizontal: 20, paddingBottom: 118 },
  loader: { marginTop: 30 },
  contact: { flexDirection: 'row', alignItems: 'center', minHeight: 76, borderBottomWidth: 1, borderBottomColor: '#E8E8E8' },
  avatar: { width: 49, height: 49, borderRadius: 25, backgroundColor: colors.soft, borderWidth: 1, borderColor: '#E6E1E1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontWeight: '900', fontSize: 13 },
  contactBody: { flex: 1, marginLeft: 14 },
  name: { color: colors.text, fontSize: 15, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  empty: { color: colors.muted, paddingTop: 30, textAlign: 'center' },
});
