import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { API_URL } from '../config/api';
import { authHeaders } from '../services/apiClient';
import { colors } from '../theme/aphenasTheme';

export default function CreateGroupModal({ officer, onClose, onCreated }) {
  const currentUserId = Number(officer?.userId || officer?.id || 0);
  const authToken = officer?.authToken;
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch(`${API_URL}/users`, {
      headers: authHeaders(authToken),
    })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load officers');
        if (mounted) setUsers((data.users || []).filter((user) => Number(user.id) !== currentUserId));
      })
      .catch((error) => Alert.alert('Unable to load officers', error.message))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [authToken, currentUserId]);

  const selectedCount = useMemo(() => selected.size, [selected]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const create = async () => {
    if (!currentUserId) return Alert.alert('Session unavailable', 'Please sign in again.');
    if (selectedCount < 1) return Alert.alert('Select members', 'Choose at least one other officer.');
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/conversations/group`, {
        method: 'POST',
        headers: authHeaders(authToken),
        body: JSON.stringify({ userId: currentUserId, name: name.trim() || 'Group chat', memberIds: Array.from(selected) }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to create group');
      onCreated?.({ ...data.conversation, conversationId: data.conversationId, id: data.conversationId, name: name.trim() || 'Group chat', type: 'GROUP' });
    } catch (error) {
      Alert.alert('Create group failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.titleRow}>
            <View><Text style={styles.title}>Create Group</Text><Text style={styles.subtitle}>{selectedCount} member{selectedCount === 1 ? '' : 's'} selected</Text></View>
            <Pressable onPress={onClose}><Feather name="x" size={24} color={colors.text} /></Pressable>
          </View>
          <TextInput value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor="#9A9A9A" style={styles.nameInput} />
          {loading ? <ActivityIndicator color={colors.green} style={styles.loader} /> : (
            <FlatList
              data={users}
              keyExtractor={(item) => String(item.id)}
              style={styles.list}
              renderItem={({ item }) => {
                const checked = selected.has(item.id);
                return <Pressable onPress={() => toggle(item.id)} style={styles.row}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{String(item.name || item.service_id || 'SC').slice(0, 2).toUpperCase()}</Text></View>
                  <View style={styles.rowBody}><Text style={styles.rowName}>{item.name || item.display_name || item.service_id}</Text><Text style={styles.rowMeta}>{item.service_id}</Text></View>
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <Feather name="check" size={14} color="#FFFFFF" />}</View>
                </Pressable>;
              }}
              ListEmptyComponent={<Text style={styles.empty}>No other officers available.</Text>}
            />
          )}
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable style={styles.create} onPress={create} disabled={saving}><Text style={styles.createText}>{saving ? 'Creating…' : 'Create'}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', padding: 24 },
  panel: { maxHeight: '86%', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 20, elevation: 10 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: colors.green, fontSize: 21, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 4 },
  nameInput: { height: 46, marginTop: 18, borderRadius: 23, backgroundColor: colors.soft, paddingHorizontal: 16, color: colors.text },
  list: { marginTop: 10 },
  loader: { paddingVertical: 30 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 66, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E6E1E1' },
  avatarText: { color: colors.text, fontWeight: '900', fontSize: 12 },
  rowBody: { flex: 1, marginLeft: 12 },
  rowName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  rowMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#BDBDBD', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.green, borderColor: colors.green },
  empty: { paddingVertical: 24, textAlign: 'center', color: colors.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  cancel: { paddingHorizontal: 16, paddingVertical: 12 },
  cancelText: { color: '#555', fontWeight: '700' },
  create: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 20, backgroundColor: colors.green },
  createText: { color: '#FFF', fontWeight: '800' },
});
