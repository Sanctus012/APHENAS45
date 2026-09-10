import React, { useState } from 'react';
import { Alert, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PreferencesProvider } from './context/PreferencesContext';
import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import CompleteProfileScreen from './screens/CompleteProfileScreen';
import RecoveryPhraseScreen from './screens/RecoveryPhraseScreen';
import ChatPINSetupScreen from './screens/ChatPINSetupScreen';
import ChatListScreen from './screens/ChatListScreen';
import NewChatScreen from './screens/NewChatScreen';
import ChatScreen from './screens/ChatScreen';
import CallsScreen from './screens/CallsScreen';
import NewCallScreen from './screens/NewCallScreen';
import ActiveCallScreen from './screens/ActiveCallScreen';
import SignalScreen from './screens/SignalScreen';
import SettingsScreen from './screens/SettingsScreen';
import AdminProvisioningScreen from './screens/AdminProvisioningScreen';
import socket from './services/socketService';
import { colors } from './theme/aphenasTheme';

const oldTextRender = Text.render;
Text.render = function (...args) {
  const origin = oldTextRender.call(this, ...args);
  return React.cloneElement(origin, {
    style: [{ fontFamily: 'sans-serif-condensed' }, origin.props.style],
  });
};

const RootStack = createNativeStackNavigator();
const ChatStack = createNativeStackNavigator();
const CallsStack = createNativeStackNavigator();
const GroupsStack = createNativeStackNavigator();
const SignalStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();


const stackOptions = {
  headerShown: false,
  animation: 'slide_from_right',
};

function userIdFromOfficer(officer) {
  return Number(officer?.userId || officer?.id || 0);
}

function MainTabBar({ state, navigation }) {
  const focusedRoute = state.routes[state.index];
  if ((focusedRoute.state?.index || 0) > 0) return null;

  const tabs = [
    { key: 'ChatsTab', label: 'Chat', icon: 'chat' },
    { key: 'SignalTab', label: 'Signal', icon: 'signal' },
    { key: 'GroupsTab', label: 'Groups', icon: 'groups' },
    { key: 'CallsTab', label: 'Calls', icon: 'calls' },
    { key: 'SettingsTab', label: 'Settings', icon: 'settings' },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const routeIndex = state.routes.findIndex((route) => route.name === tab.key);
        const focused = state.index === routeIndex;
        const color = focused ? colors.green : colors.text;
        return (
          <Pressable
            key={tab.key}
            style={styles.bottomTab}
            onPress={() => navigation.navigate(tab.key)}
          >
            {tab.icon === 'chat' && <Ionicons name="chatbubble-outline" size={25} color={color} />}
            {tab.icon === 'signal' && <MaterialCommunityIcons name="signal-cellular-outline" size={25} color={color} />}
            {tab.icon === 'groups' && <Feather name="users" size={25} color={color} />}
            {tab.icon === 'calls' && <Feather name="phone" size={25} color={color} />}
            {tab.icon === 'settings' && <Feather name="settings" size={25} color={color} />}
            <Text style={[styles.bottomLabel, focused && styles.activeTabText]}>{tab.label}</Text>
            {focused && tab.key === 'ChatsTab' && <View style={styles.activeLine} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function ChatStackScreen({ officer, onLogout }) {
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true, animation: 'slide_from_right' }}>
      <ChatStack.Screen name="ChatList">
        {(props) => <ChatListScreen {...props} officer={officer} onLogout={onLogout} listType="Chats" />}
      </ChatStack.Screen>

      <ChatStack.Screen name="NewChat">
        {(props) => <NewChatScreen {...props} officer={officer} />}
      </ChatStack.Screen>

      <ChatStack.Screen name="ChatConversation">
        {(props) => <ChatScreen {...props} currentUser={officer} />}
      </ChatStack.Screen>
    </ChatStack.Navigator>
  );
}

function GroupsStackScreen({ officer }) {
  return (
    <GroupsStack.Navigator screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true, animation: 'slide_from_right' }}>
      <GroupsStack.Screen name="GroupList">
        {(props) => <ChatListScreen {...props} officer={officer} listType="Groups" />}
      </GroupsStack.Screen>

      <GroupsStack.Screen name="ChatConversation">
        {(props) => <ChatScreen {...props} currentUser={officer} />}
      </GroupsStack.Screen>
    </GroupsStack.Navigator>
  );
} 

function CallsStackScreen({ officer, mainNavigation }) {
  const currentUserId = userIdFromOfficer(officer);
  const authToken = officer?.authToken;

  return (
    <CallsStack.Navigator screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true, animation: 'slide_from_right' }}>
      <CallsStack.Screen name="CallsList">
        {(props) => (
          <CallsScreen
            {...props}
            userId={currentUserId}
            authToken={authToken}
            onStartCall={() => props.navigation.navigate('NewCall')}
            onOpenConversation={(call) => {
              if (!call.conversation_id) return;
              mainNavigation.navigate('ChatsTab', {
                screen: 'ChatConversation',
                params: {
                  conversationId: call.conversation_id,
                  conversation: {
                    id: call.conversation_id,
                    conversationId: call.conversation_id,
                    name: call.participant_name || call.title || 'Unknown officer',
                    participantId: call.participant_id,
                    participant_id: call.participant_id,
                    participant_name: call.participant_name,
                    participant_service_id: call.participant_service_id,
                  },
                },
              });
            }}
          />
        )}
      </CallsStack.Screen>
      <CallsStack.Screen name="NewCall">
        {(props) => <NewCallScreen {...props} officer={officer} />}
      </CallsStack.Screen>
      <CallsStack.Screen name="ActiveCall">
        {(props) => <ActiveCallScreen {...props} officer={officer} />}
      </CallsStack.Screen>
    </CallsStack.Navigator>
  );
}

function SignalStackScreen({ officer, mainNavigation }) {
  return (
    <SignalStack.Navigator screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true, animation: 'slide_from_right' }}>
      <SignalStack.Screen name="SignalHome">
        {(props) => (
          <SignalScreen
            {...props}
            officer={officer}
            onOpenGroups={() => mainNavigation.navigate('GroupsTab')}
          />
        )}
      </SignalStack.Screen>
    </SignalStack.Navigator>
  );
}

function SettingsStackScreen({ officer, onLogout }) {
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        animation: 'slide_from_right',
      }}
    >
      <SettingsStack.Screen name="SettingsHome">
        {(props) => (
          <SettingsScreen
            {...props}
            officer={officer}
            onLogout={onLogout}
          />
        )}
      </SettingsStack.Screen>

      <SettingsStack.Screen name="CreateOfficer">
        {(props) => (
          <AdminProvisioningScreen
            {...props}
            officer={officer}
            authToken={officer?.authToken}
            onOpenChats={() => props.navigation.navigate('SettingsHome')}
            onLogout={onLogout}
          />
        )}
      </SettingsStack.Screen>
    </SettingsStack.Navigator>
  );
}

function MainApplication({ officer, onLogout }) {
  return (
    <Tab.Navigator
      initialRouteName="ChatsTab"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <MainTabBar {...props} />}
    >
      <Tab.Screen name="ChatsTab">
        {() => <ChatStackScreen officer={officer} onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen name="SignalTab">
        {({ navigation }) => <SignalStackScreen officer={officer} mainNavigation={navigation} />}
      </Tab.Screen>
      <Tab.Screen name="GroupsTab">
        {() => <GroupsStackScreen officer={officer} />}
      </Tab.Screen>
      <Tab.Screen name="CallsTab">
        {({ navigation }) => <CallsStackScreen officer={officer} mainNavigation={navigation} />}
      </Tab.Screen>
      <Tab.Screen name="SettingsTab">
        {() => <SettingsStackScreen officer={officer} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

function AppContent() {
  const [currentOfficer, setCurrentOfficer] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [chatPin, setChatPin] = useState('');

  const logout = (navigation) => {
    setCurrentOfficer(null);
    setAuthToken(null);
    socket.disconnect();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const isAdminOfficer = (officer) => String(officer?.role || '').toLowerCase() === 'admin';
  const appScreenForOfficer = (officer) => (isAdminOfficer(officer) ? 'Admin' : 'Main');
  const needsChatPin = (officer) => !officer?.hasChatPin;

  const handleLoginSuccess = (navigation, result) => {
    const officerWithToken = {
      ...result.officer,
      authToken: result.authToken || null,
    };

    setCurrentOfficer(officerWithToken);
    if (result.authToken) setAuthToken(result.authToken);

    if (result.nextStep === 'CHANGE_PASSWORD') {
      navigation.navigate('ChangePassword');
      return;
    }

    if (result.nextStep === 'COMPLETE_PROFILE') {
      navigation.navigate('CompleteProfile');
      return;
    }

    if (result.nextStep === 'APP') {
      navigation.reset({
        index: 0,
        routes: [{ name: needsChatPin(officerWithToken) ? 'ChatPin' : appScreenForOfficer(officerWithToken) }],
      });
      return;
    }

    Alert.alert('Login Error', 'Unknown login state returned by the server.');
  };

  const handlePasswordChanged = (navigation, result) => {
    const officerWithToken = {
      ...result.officer,
      authToken: result.authToken || authToken || null,
    };

    setCurrentOfficer(officerWithToken);

    if (result.nextStep === 'COMPLETE_PROFILE') {
      navigation.navigate('CompleteProfile');
      return;
    }

    if (result.nextStep === 'APP') {
      navigation.reset({
        index: 0,
        routes: [{ name: needsChatPin(officerWithToken) ? 'ChatPin' : appScreenForOfficer(officerWithToken) }],
      });
    }
  };

  const handleProfileCompleted = (navigation, result) => {
    setCurrentOfficer(result.officer);
    navigation.navigate('Recovery');
  };

  const handleRecoveryCompleted = (navigation, result) => {
    if (result?.authToken) setAuthToken(result.authToken);
    if (result?.officer) {
      setCurrentOfficer({
        ...result.officer,
        authToken: result.authToken || authToken || null,
      });
    }
    navigation.navigate('ChatPin');
  };

  const completeChatPin = (navigation) => {
    const nextOfficer = { ...currentOfficer, hasChatPin: true };
    setCurrentOfficer(nextOfficer);
    navigation.reset({ index: 0, routes: [{ name: appScreenForOfficer(nextOfficer) }] });
  };

  return (
    <NavigationContainer>
     <RootStack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true, animation: 'slide_from_right' }}>
         <RootStack.Screen name="Splash">
          {({ navigation }) => <SplashScreen onFinish={() => navigation.replace('Login')} />}
        </RootStack.Screen>
        <RootStack.Screen name="Login">
          {({ navigation }) => (
            <LoginScreen
              onLoginSuccess={(result) => handleLoginSuccess(navigation, result)}
              onResetPassword={() => navigation.navigate('ResetPassword')}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ResetPassword">
          {({ navigation }) => (
            <ResetPasswordScreen
              initialServiceId={currentOfficer?.serviceId}
              onBack={() => navigation.goBack()}
              onResetSuccess={() => navigation.popToTop()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ChangePassword">
          {({ navigation }) => (
            <ChangePasswordScreen
              officer={currentOfficer}
              onPasswordChanged={(result) => handlePasswordChanged(navigation, result)}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="CompleteProfile">
          {({ navigation }) => (
            <CompleteProfileScreen
              officer={currentOfficer}
              onProfileCompleted={(result) => handleProfileCompleted(navigation, result)}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Recovery">
          {({ navigation }) => (
            <RecoveryPhraseScreen
              officer={currentOfficer}
              onRecoveryCompleted={(result) => handleRecoveryCompleted(navigation, result)}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ChatPin">
          {({ navigation }) => (
            <ChatPINSetupScreen
              officer={currentOfficer}
             onComplete={(pin) => completeChatPin(navigation, pin)} 
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Main">
          {({ navigation }) => (
            <MainApplication
              officer={currentOfficer}
              onLogout={() => logout(navigation)}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Admin">
          {({ navigation }) => (
            <AdminProvisioningScreen
              officer={currentOfficer}
              authToken={authToken}
              onOpenChats={() => navigation.replace('Main')}
              onLogout={() => logout(navigation)}
            />
          )}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <AppContent />
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bottomNav: { flexDirection: 'row', height: 100, borderTopWidth: 0, borderColor: '#E9E9E9', backgroundColor: '#FFFFFF', paddingBottom: 30, borderTopLeftRadius: 13, borderTopRightRadius: 13 },
  bottomTab: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  bottomLabel: { color: colors.text, fontSize: 11, marginTop: 2 },
  activeTabText: { color: colors.green },
  activeLine: { position: 'absolute', bottom: 2, width: 24, height: 4, borderRadius: 2, backgroundColor: colors.text },
});
