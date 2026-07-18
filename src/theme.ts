import { StyleSheet } from 'react-native'

export interface Palette {
  bg: string
  surface: string
  surfaceAlt: string
  border: string
  text: string
  textDim: string
  textFaint: string
  accent: string
  accentText: string
  green: string
  yellow: string
  red: string
  userBubble: string
  assistantBubble: string
}

export const darkColors: Palette = {
  bg: '#0D1117',
  surface: '#161B22',
  surfaceAlt: '#1F2630',
  border: '#2D333B',
  text: '#E6EDF3',
  textDim: '#8B949E',
  textFaint: '#6E7681',
  accent: '#E8A33D',
  accentText: '#0D1117',
  green: '#3FB950',
  yellow: '#D29922',
  red: '#F85149',
  userBubble: '#2F3B4C',
  assistantBubble: '#161B22',
}

export const lightColors: Palette = {
  bg: '#F6F8FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EAEEF2',
  border: '#D0D7DE',
  text: '#1F2328',
  textDim: '#57606A',
  textFaint: '#8C959F',
  accent: '#9A6700',
  accentText: '#FFFFFF',
  green: '#1A7F37',
  yellow: '#9A6700',
  red: '#CF222E',
  userBubble: '#DCE5EF',
  assistantBubble: '#FFFFFF',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
}

/**
 * Memoize a palette-dependent stylesheet: there are only two palette
 * objects, so each screen builds at most two stylesheets ever.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: Palette) => T
): (colors: Palette) => T {
  const cache = new WeakMap<Palette, T>()
  return (colors: Palette) => {
    let styles = cache.get(colors)
    if (!styles) {
      styles = factory(colors)
      cache.set(colors, styles)
    }
    return styles
  }
}
