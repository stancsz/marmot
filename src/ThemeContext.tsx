import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { darkColors, lightColors, Palette } from './theme'

export type ThemeMode = 'system' | 'dark' | 'light'

const THEME_KEY = 'marmot.theme.v1'

interface ThemeValue {
  colors: Palette
  mode: ThemeMode
  resolved: 'dark' | 'light'
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeValue>({
  colors: darkColors,
  mode: 'dark',
  resolved: 'dark',
  setMode: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>('dark')

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === 'system' || saved === 'dark' || saved === 'light') {
        setModeState(saved)
      }
    })
  }, [])

  const value = useMemo<ThemeValue>(() => {
    const resolved = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode
    return {
      colors: resolved === 'light' ? lightColors : darkColors,
      mode,
      resolved,
      setMode: (next: ThemeMode) => {
        setModeState(next)
        AsyncStorage.setItem(THEME_KEY, next)
      },
    }
  }, [mode, system])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext)
}
