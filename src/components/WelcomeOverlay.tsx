import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native'
import { pickGreeting } from '../lib/greetings'
import { Palette, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'

const SHOW_MS = 2100

/**
 * The launch moment: the marmot pops up, delivers one line, and gets out
 * of the way. Shows briefly on every start; tap anywhere to skip.
 */
export default function WelcomeOverlay({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [greeting] = useState(() => pickGreeting())
  const fade = useRef(new Animated.Value(1)).current
  const pop = useRef(new Animated.Value(0.5)).current
  const rise = useRef(new Animated.Value(24)).current
  const textFade = useRef(new Animated.Value(0)).current
  const dismissed = useRef(false)

  const dismiss = () => {
    if (dismissed.current) return
    dismissed.current = true
    Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(onDone)
  }

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4.5, tension: 90, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      Animated.timing(textFade, { toValue: 1, duration: 500, delay: 260, useNativeDriver: true }),
    ]).start()
    const timer = setTimeout(dismiss, SHOW_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Animated.View style={[styles.overlay, { opacity: fade }]}>
      <Pressable style={styles.press} onPress={dismiss}>
        <Animated.Image
          source={require('../../assets/marmot-hello.webp')}
          style={[styles.mascot, { transform: [{ scale: pop }, { translateY: rise }] }]}
          resizeMode="contain"
        />
        <Animated.View style={{ opacity: textFade, alignItems: 'center' }}>
          <Text style={styles.wordmark}>Marmot</Text>
          <Text style={styles.greeting}>“{greeting}”</Text>
          <Text style={styles.sub}>fully on-device</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.bg,
      zIndex: 100,
    },
    press: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    mascot: { width: 190, height: 236, marginBottom: spacing.lg },
    wordmark: {
      color: colors.text,
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: 0.5,
      marginBottom: spacing.md,
    },
    greeting: {
      color: colors.textDim,
      fontSize: 16,
      fontStyle: 'italic',
      textAlign: 'center',
      lineHeight: 23,
      maxWidth: 300,
    },
    sub: {
      color: colors.textFaint,
      fontSize: 12,
      marginTop: spacing.lg,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
  })
)
