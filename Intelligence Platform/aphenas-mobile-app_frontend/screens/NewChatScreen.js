import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { API_URL } from '../config/api';
import { authHeaders } from '../services/apiClient';
import { colors } from '../theme/aphenasTheme';

export default function NewChatScreen({ officer, onBack, navigation }) {
  const currentUserId = Number(officer?.userId || officer?.id || 0);
  const authToken = officer?.authToken;
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState(null);

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
        Alert.alert('Unable to load officers', error.message);
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

  const startChat = async (user) => {
    if (!currentUserId) {
      Alert.alert('Session unavailable', 'Please sign in again before starting a chat.');
      return;
    }
    setCreatingId(user.id);
    try {
      const response = await fetch(`${API_URL}/conversations/direct`, {
        method: 'POST',
        headers: authHeaders(authToken),
        body: JSON.stringify({ userId: currentUserId, participantId: user.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to create conversation');
      const participant = data.participant || {};
      const selectedName = participant.name || user.name || user.display_name || user.service_id || `Officer ${user.id}`;
      const conversation = {
        conversationId: data.conversationId,
        id: data.conversationId,
        name: selectedName,
        participant_name: selectedName,
        participant_service_id: participant.serviceId || user.service_id,
        participantId: participant.id || user.id,
        participant_id: participant.id || user.id,
        participant: {
          id: participant.id || user.id,
          name: selectedName,
          serviceId: participant.serviceId || user.service_id,
          rank: participant.rank || user.rank,
          unit: participant.unit || user.unit,
        },
        type: 'DIRECT',
      };

      if (onBack) {
        onBack(conversation);
        return;
      }

      navigation.replace('ChatConversation', {
        conversation,
        conversationId: data.conversationId,
      });
    } catch (error) {
      Alert.alert('Create chat failed', error.message);
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => onBack ? onBack() : navigation.goBack()} hitSlop={8}>
          <Feather name="arrow-left" size={25} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>New Chat</Text>
      </View>
      <View style={styles.searchWrap}>
        <Feather name="search" size={22} color="#A9A9A9" style={styles.searchIcon} />
        <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search officers" placeholderTextColor="#A5A5A5" />
      </View>
      <Text style={styles.sectionTitle}>Available Officers</Text>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color={colors.green} style={styles.loader} /> : filteredUsers.length === 0 ? (
          <Text style={styles.empty}>No officers found.</Text>
        ) : filteredUsers.map((user) => (
          <Pressable key={String(user.id)} style={styles.contact} onPress={() => startChat(user)} disabled={creatingId === user.id}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{String(user.name || user.service_id || 'SC').slice(0, 2).toUpperCase()}</Text></View>
            <View style={styles.contactBody}>
              <Text style={styles.name}>{user.name || user.display_name || user.service_id}</Text>
              <Text style={styles.meta}>{user.service_id}{user.rank ? ` • ${user.rank}` : ''}</Text>
            </View>
            {creatingId === user.id ? <ActivityIndicator color={colors.green} /> : <Feather name="chevron-right" size={24} color={colors.green} />}
          </Pressable>
        ))}
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
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  loader: { marginTop: 30 },
  contact: { flexDirection: 'row', alignItems: 'center', minHeight: 76, borderBottomWidth: 1, borderBottomColor: '#E8E8E8' },
  avatar: { width: 49, height: 49, borderRadius: 25, backgroundColor: colors.soft, borderWidth: 1, borderColor: '#E6E1E1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontWeight: '900' },
  contactBody: { flex: 1, marginLeft: 14 },
  name: { color: colors.text, fontSize: 15, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  empty: { color: colors.muted, paddingTop: 30, textAlign: 'center' },
});
