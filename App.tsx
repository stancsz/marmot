import React, { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { DarkTheme, DefaultTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import ChatListScreen from './src/screens/ChatListScreen'
import ChatScreen from './src/screens/ChatScreen'
import MemoryScreen from './src/screens/MemoryScreen'
import ModelsScreen from './src/screens/ModelsScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import VoiceScreen from './src/screens/VoiceScreen'
import IngestScreen from './src/screens/IngestScreen'
import FlightModeScreen from './src/screens/FlightModeScreen'
import WelcomeOverlay from './src/components/WelcomeOverlay'
import { useShareIntent } from 'expo-share-intent'
import { ThemeProvider, useTheme } from './src/ThemeContext'
import IconButton from './src/components/IconButton'
import type { RootStackParamList } from './src/navigation'
import { sharedFileToAttachment } from './src/lib/sharedMedia'
import type { Attachment } from './src/types'

const Stack = createNativeStackNavigator<RootStackParamList>()
const navRef = createNavigationContainerRef<RootStackParamList>()

// marmot://ask?text=... — iOS Shortcuts / Android automation entry point
const linking = {
  prefixes: ['marmot://'],
  config: { screens: { Ingest: 'ask' } },
}

function AppInner() {
  const { colors, resolved } = useTheme()
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent()
  const [navigationReady, setNavigationReady] = useState(false)

  // Text and screenshots shared from another app land on the quick-actions
  // screen. Shared files are copied into Marmot storage before navigation so
  // the local model never depends on a provider-owned URI.
  useEffect(() => {
    if (!hasShareIntent || !navigationReady) return
    const text = shareIntent?.text ?? shareIntent?.webUrl ?? ''
    const image = shareIntent?.files?.find((file) => file.mimeType?.toLowerCase().startsWith('image/'))
    let attachment: Attachment | undefined
    if (image) {
      try {
        attachment = sharedFileToAttachment(image)
      } catch (error) {
        console.warn('Marmot could not import the shared image', error)
      }
    }
    if (!text && !attachment) {
      resetShareIntent()
      return
    }
    if (navRef.isReady()) {
      navRef.navigate('Ingest', {
        ...(text ? { text } : {}),
        ...(attachment ? { attachment } : {}),
      })
      resetShareIntent()
    }
  }, [hasShareIntent, navigationReady, shareIntent, resetShareIntent])
  const base = resolved === 'light' ? DefaultTheme : DarkTheme
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  }

  return (
    <NavigationContainer
      ref={navRef}
      theme={navTheme}
      linking={linking}
      onReady={() => setNavigationReady(true)}
    >
      <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen
          name="Chats"
          component={ChatListScreen}
          options={({ navigation }) => ({
            title: 'Marmot',
            headerRight: () => (
              <IconButton
                accessibilityLabel="Open settings"
                hitSlop={8}
                icon="settings"
                onPress={() => navigation.navigate('Settings')}
                variant="ghost"
              />
            ),
          })}
        />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
        <Stack.Screen name="Models" component={ModelsScreen} options={{ title: 'Model library' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        <Stack.Screen name="Memory" component={MemoryScreen} options={{ title: 'Memory' }} />
        <Stack.Screen name="Voice" component={VoiceScreen} options={{ title: 'Voice' }} />
        <Stack.Screen name="Ingest" component={IngestScreen} options={{ title: 'Quick actions' }} />
        <Stack.Screen name="Flight" component={FlightModeScreen} options={{ title: 'Flight mode' }} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function App() {
  const [welcomed, setWelcomed] = useState(false)
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
        {!welcomed && <WelcomeOverlay onDone={() => setWelcomed(true)} />}
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
