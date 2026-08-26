import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { API_URL } from '../config/api';
import { authHeaders } from '../services/apiClient';
import socket from '../services/socketService';
import { colors, initials } from '../theme/aphenasTheme';

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function ActiveCallScreen({ officer, navigation, route }) {
  const initialCall = route?.params?.call || {};
  const participant = route?.params?.participant || {};
  const [call, setCall] = useState(initialCall);
  const [duration, setDuration] = useState(0);
  const authToken = officer?.authToken;
  const name = participant.name || participant.serviceId || 'Unknown officer';
  const callId = call.callId || call.call?.id || call.id;
  const conversationId = call.conversationId || call.conversation_id;

  const updateCallStatus = useCallback(async (status) => {
    if (!callId) return;
    const response = await fetch(`${API_URL}/calls/${callId}`, {
      method: 'PATCH',
      headers: authHeaders(authToken),
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to update call');
    setCall((current) => ({ ...current, ...data.call, status: data.call.status || status }));
  }, [authToken, callId]);

  useEffect(() => {
    const handleAccepted = (payload) => {
      if (Number(payload.callId) === Number(callId) || Number(payload.conversationId) === Number(conversationId)) {
        setCall((current) => ({ ...current, ...payload, status: 'ACTIVE' }));
      }
    };
    const handleEnded = (payload) => {
      if (Number(payload.callId) === Number(callId) || Number(payload.conversationId) === Number(conversationId)) {
        setCall((current) => ({ ...current, ...payload, status: payload.status || 'ENDED' }));
      }
    };

    socket.on('callAccepted', handleAccepted);
    socket.on('callRejected', handleEnded);
    socket.on('callEnded', handleEnded);
    return () => {
      socket.off('callAccepted', handleAccepted);
      socket.off('callRejected', handleEnded);
      socket.off('callEnded', handleEnded);
    };
  }, [callId, conversationId]);

  useEffect(() => {
    if (call.status !== 'ACTIVE') return undefined;
    const timer = setInterval(() => setDuration((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [call.status]);

  const statusText = useMemo(() => {
    if (call.status === 'ACTIVE') return formatDuration(duration);
    if (call.status === 'ENDED') return 'Call ended';
    if (call.status === 'DECLINED') return 'Call declined';
    if (call.status === 'MISSED') return 'Call missed';
    return 'Calling...';
  }, [call.status, duration]);

  const endCall = async () => {
    try {
      socket.emit('callEnded', { conversationId, callId });
      await updateCallStatus('ENDED');
      navigation.goBack();
    } catch (error) {
      Alert.alert('End call failed', error.message || 'Unable to end call.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111111" />
      <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={8}>
        <Feather name="chevron-left" size={30} color="#FFFFFF" />
      </Pressable>
      <View style={styles.center}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name, 'CO')}</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
        {!!participant.serviceId && <Text style={styles.meta}>{participant.serviceId}</Text>}
        <Text style={styles.status}>{statusText}</Text>
      </View>
      <View style={styles.controls}>
        <Pressable style={styles.control}>
          <Feather name="mic" size={24} color="#FFFFFF" />
        </Pressable>
        <Pressable style={[styles.control, styles.endControl]} onPress={endCall}>
          <Feather name="phone-off" size={25} color="#FFFFFF" />
        </Pressable>
        <Pressable style={styles.control}>
          <Feather name="volume-2" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
  backButton: { position: 'absolute', top: (StatusBar.currentHeight || 0) + 14, left: 18, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  avatarText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  name: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  meta: { color: '#BBBBBB', fontSize: 13, marginTop: 7, fontWeight: '700' },
  status: { color: '#DADADA', fontSize: 15, marginTop: 18, fontWeight: '700' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingBottom: 56 },
  control: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#2E2E2E', alignItems: 'center', justifyContent: 'center' },
  endControl: { backgroundColor: '#B83232' },
});
