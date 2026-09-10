import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import CreateGroupModal from '../components/CreateGroupModal';
import socket from '../services/socketService';
import { API_URL } from '../config/api';
import { authHeaders } from '../services/apiClient';
import { createDirectConversation } from '../services/conversationService';
import { getCachedDeviceId } from '../services/deviceService';
import { colors, formatListTime, initials as initialsFor } from '../theme/aphenasTheme';

function userIdFromOfficer(officer) {
  return Number(officer?.userId || officer?.id || 0);
}

function displayName(item) {
  return item?.name || item?.title || item?.participant_name || item?.participant_service_id || 'Unknown officer';
}

function initials(value) {
  return initialsFor(value, 'CO');
}

function formatTime(value) {
  return formatListTime(value);
}
function previewText(item) {
  return 'New message';
}

export default function ChatListScreen({ officer, onLogout, navigation, route, listType }) {
  const currentUserId = userIdFromOfficer(officer);
  const authToken = officer?.authToken;
  const activeTab = listType || route?.params?.listType || 'Chats';
  const [search, setSearch] = useState('');
  const [chats, setChats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [knownConversationNames, setKnownConversationNames] = useState({});
  const refreshTimerRef = useRef(null);

  const loadConversations = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const [chatResponse, groupResponse] = await Promise.all([
        fetch(`${API_URL}/conversations/${currentUserId}?type=DIRECT`, {
          headers: authHeaders(authToken),
        }),
        fetch(`${API_URL}/groups/${currentUserId}`, {
          headers: authHeaders(authToken),
        }),
      ]);
      const [chatData, groupData] = await Promise.all([
        chatResponse.json(),
        groupResponse.json(),
      ]);
      if (!chatResponse.ok || !chatData.success) throw new Error(chatData.message || 'Unable to load chats');
      if (!groupResponse.ok || !groupData.success) throw new Error(groupData.message || 'Unable to load groups');
      setChats((current) => {
        const currentNames = new Map(current.map((item) => [String(item.id), displayName(item)]));
        return (chatData.conversations || []).map((item) => {
          const apiName = displayName(item);
          const remembered = knownConversationNames[String(item.id)] || currentNames.get(String(item.id));
          const usableApiName = apiName && apiName !== 'Unknown officer' ? apiName : null;
          return { ...item, name: usableApiName || remembered || item.participant_service_id || item.title || 'Officer conversation' };
        });
      });
      setGroups(groupData.groups || []);
    } catch (error) {
      console.error('Loading conversations failed:', error);
      Alert.alert('Connection problem', error.message || 'Unable to load your conversations');
    } finally {
      setLoading(false);
    }
  }, [authToken, currentUserId, knownConversationNames]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!currentUserId) return undefined;
    socket.auth = { ...(socket.auth || {}), token: authToken, deviceId: getCachedDeviceId() };
    const refreshFromRealtime = (payload) => {
      if (payload?.conversationId && Number(payload.conversationId) <= 0) return;
      if (payload?.id && Number(payload.sender_id) !== currentUserId) {
        socket.emit('messageDelivered', {
          messageId: payload.id,
          conversationId: payload.conversation_id || payload.conversationId,
        });
      }
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(loadConversations, 150);
    };
    const identify = () => socket.emit('userOnline', currentUserId);
    socket.on('conversationUpdated', refreshFromRealtime);
    socket.on('newMessage', refreshFromRealtime);
    socket.on('connect', identify);
    if (!socket.connected) socket.connect();
    else identify();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      socket.off('conversationUpdated', refreshFromRealtime);
      socket.off('newMessage', refreshFromRealtime);
      socket.off('connect', identify);
    };
  }, [currentUserId, loadConversations]);

  const visibleItems = useMemo(() => {
    const source = activeTab === 'Groups' ? groups : chats;
    const query = search.trim().toLowerCase();
    if (!query) return source;
    return source.filter((item) => `${displayName(item)} ${item.last_message || ''}`.toLowerCase().includes(query));
  }, [activeTab, chats, groups, search]);

  if (showCreateGroup) {
    return (
      <CreateGroupModal
        officer={officer}
        onClose={() => setShowCreateGroup(false)}
        onCreated={(created) => {
          setShowCreateGroup(false);
          loadConversations();
          if (created?.conversationId) {
            navigation.navigate('ChatConversation', {
              conversation: created,
              conversationId: created.conversationId,
            });
          }
        }}
      />
    );
  }

  const openConversation = async (item) => {
    const name = displayName(item) !== 'Unknown officer' ? displayName(item) : (knownConversationNames[String(item.id)] || item.participant_service_id || item.title || 'Officer conversation');
    const participantId = Number(item.participant_id || item.participantId || 0);
    const isDirect = String(item.type || '').toUpperCase() !== 'GROUP';

    try {
      const resolved = isDirect && currentUserId && participantId
        ? await createDirectConversation(currentUserId, participantId, authToken)
        : null;
      const nextConversationId = resolved?.conversationId || item.id || item.conversationId;
      const participant = resolved?.participant || {};
      const nextName = participant.name || name;

      setKnownConversationNames((current) => ({ ...current, [String(nextConversationId)]: nextName }));

setChats((current) =>
  current.map((chat) =>
    String(chat.id) === String(item.id)
      ? { ...chat, unread_count: 0 }
      : chat
  )
);

setGroups((current) =>
  current.map((group) =>
    String(group.id) === String(item.id)
      ? { ...group, unread_count: 0 }
      : group
  )
);

navigation.navigate('ChatConversation', {
  conversationId: nextConversationId,
  conversation: {
    ...item,
    id: nextConversationId,
    name: nextName,
    conversationId: nextConversationId,
    participantId: participant.id || participantId,
    participant_id: participant.id || participantId,
    participant_name: nextName,
    participant_service_id: participant.serviceId || item.participant_service_id,
  },
});
    } catch (error) {
      Alert.alert('Open chat failed', error.message || 'Unable to open this conversation.');
    }
  };

  const handleLongPress = (item) => {
    Alert.alert(displayName(item), 'Conversation actions', [
      {
        text: 'Clear history',
        onPress: () => Alert.alert(
          'Clear history',
          `Delete the message history with ${displayName(item)}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  const response = await fetch(`${API_URL}/conversations/${item.id}/history`, {
                    method: 'DELETE',
                    headers: authHeaders(authToken),
                    body: JSON.stringify({ userId: currentUserId }),
                  });
                  const data = await response.json();
                  if (!response.ok || !data.success) throw new Error(data.message || 'Unable to clear history');
                  loadConversations();
                } catch (error) {
                  Alert.alert('Clear history failed', error.message);
                }
              },
            },
          ]
        ),
      },
      {
        text: 'Leave chat',
        onPress: async () => {
          try {
            const response = await fetch(`${API_URL}/conversations/${item.id}/leave`, {
              method: 'POST',
              headers: authHeaders(authToken),
              body: JSON.stringify({ userId: currentUserId }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'Unable to leave chat');
            loadConversations();
          } catch (error) {
            Alert.alert('Leave chat failed', error.message);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmLogout = () => {
    Alert.alert('Log out', 'End this Aphenas session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          socket.emit('typing', { userId: currentUserId, isTyping: false });
          socket.disconnect();
          onLogout?.();
        },
      },
    ]);
  };

  const renderConversation = (item) => {
    const name = displayName(item);
    return (
      <Pressable
        key={String(item.id)}
        style={styles.row}
        onPress={() => openConversation(item)}
        onLongPress={() => handleLongPress(item)}
      >
        <View style={[styles.avatar, item.type === 'GROUP' && styles.groupAvatar]}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTopLine}>
            <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
            <Text style={styles.time}>{formatTime(item.last_message_at || item.last_activity)}</Text>
          </View>
          <View style={styles.rowBottomLine}>
           <Text style={styles.preview} numberOfLines={1}>
  {previewText(item)}
</Text>
            {Number(item.unread_count || 0) > 0 && (
  <View style={styles.unread}>
    <Text style={styles.unreadText}>{item.unread_count}</Text>
  </View>
)}
          </View>
        </View>
      </Pressable>
    );
  };

  const title = activeTab === 'Chats' ? 'Messages' : activeTab;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{title}</Text>
          {!!officer?.serviceId && <Text style={styles.serviceId}>{officer.serviceId}</Text>}
        </View>
      </View>

      {(activeTab === 'Chats' || activeTab === 'Groups') && (
        <View style={styles.searchWrap}>
          <Feather name="search" size={22} color="#A9A9A9" style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder={activeTab === 'Chats' ? 'Search chats or group .......' : 'Search chats or group .......'}
            placeholderTextColor="#B7B7B7"
          />
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {(activeTab === 'Chats' || activeTab === 'Groups') && loading ? (
          <ActivityIndicator color={colors.green} style={styles.loader} />
        ) : (activeTab === 'Chats' || activeTab === 'Groups') && visibleItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{search ? 'No matches' : 'No conversations yet'}</Text>
            <Text style={styles.emptyText}>{search ? 'Try another name or service number.' : 'Use + to start a secure conversation.'}</Text>
          </View>
        ) : (activeTab === 'Chats' || activeTab === 'Groups') ? (
          visibleItems.map(renderConversation)
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Signal</Text>
            <Text style={styles.emptyText}>This module is ready for the next connected service.</Text>
          </View>
        )}
      </ScrollView>

      {(activeTab === 'Chats' || activeTab === 'Groups') && (
        <Pressable style={styles.fab} onPress={() => {
          if (activeTab === 'Groups') setShowCreateGroup(true);
          else navigation.navigate('NewChat');
        }}>
          <Feather name="plus" size={30} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 24, paddingTop: (StatusBar.currentHeight || 0) + 30, paddingBottom: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 25, fontWeight: '900', color: colors.text },
  serviceId: { color: colors.muted, fontSize: 11, marginTop: 5, fontWeight: '700' },
  logoutButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center' },
  searchWrap: { marginHorizontal: 24, marginBottom: 16, height: 46, borderRadius: 24, backgroundColor: colors.soft, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  searchIcon: { marginRight: 12 },
  search: { flex: 1, color: colors.text, fontSize: 14 },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 24, paddingBottom: 118 },
  loader: { marginTop: 36 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 80, borderBottomWidth: 1, borderBottomColor: '#E4E4E4' },
  avatar: { width: 49, height: 49, borderRadius: 25, backgroundColor: colors.soft, borderWidth: 1, borderColor: '#E6E1E1', justifyContent: 'center', alignItems: 'center' },
  groupAvatar: { backgroundColor: colors.soft },
  avatarText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  rowBody: { flex: 1, marginLeft: 10, paddingVertical: 12 },
  rowTopLine: { flexDirection: 'row', alignItems: 'center' },
  rowName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '900' },
  time: { color: '#B0B0B0', fontSize: 11, marginLeft: 8 },
  rowBottomLine: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  preview: { flex: 1, color: colors.muted, fontSize: 13 },
  unread: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  unreadText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  emptyText: { color: colors.muted, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  fab: { position: 'absolute', right: 24, bottom: 107, width: 68, height: 68, borderRadius: 34, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  bottomNav: { flexDirection: 'row', height: 100, borderTopWidth: 0, borderColor: '#E9E9E9', backgroundColor: '#FFFFFF', paddingBottom: 30, borderTopLeftRadius: 13, borderTopRightRadius: 13 },
  bottomTab: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  bottomLabel: { color: colors.text, fontSize: 11, marginTop: 2 },
  activeTabText: { color: colors.green },
  activeLine: { position: 'absolute', bottom: 2, width: 24, height: 4, borderRadius: 2, backgroundColor: colors.text },
});
