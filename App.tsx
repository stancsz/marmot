import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { Pressable, Text } from 'react-native'
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import ChatListScreen from './src/screens/ChatListScreen'
import ChatScreen from './src/screens/ChatScreen'
import ModelsScreen from './src/screens/ModelsScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import { ThemeProvider, useTheme } from './src/ThemeContext'
import type { RootStackParamList } from './src/navigation'

const Stack = createNativeStackNavigator<RootStackParamList>()

function AppInner() {
  const { colors, resolved } = useTheme()
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
    <NavigationContainer theme={navTheme}>
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
              <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={12}>
                <Text style={{ color: colors.textDim, fontSize: 15 }}>Settings</Text>
              </Pressable>
            ),
          })}
        />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
        <Stack.Screen name="Models" component={ModelsScreen} options={{ title: 'Model library' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
