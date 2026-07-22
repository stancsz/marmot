import React, { useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import type { PressableProps, StyleProp, ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Palette, radius, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import Icon from './Icon'
import type { IconName } from './Icon'

/** Visual treatments available for shared icon buttons. */
export type IconButtonVariant = 'secondary' | 'primary' | 'danger' | 'ghost'

/** Props for the accessible, animated shared icon button. */
export interface IconButtonProps {
  accessibilityLabel: string
  accessibilityHint?: string
  disabled?: boolean
  hitSlop?: PressableProps['hitSlop']
  icon: IconName
  iconSize?: number
  onPress: () => void
  size?: number
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: IconButtonVariant
}

const MIN_TOUCH_SIZE = 44
const SPRING_CONFIG = { damping: 16, stiffness: 280, mass: 0.45 }

/**
 * Renders a minimum-44-point native-symbol button with spring press feedback.
 */
export default function IconButton({
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  hitSlop,
  icon,
  iconSize = 20,
  onPress,
  size = MIN_TOUCH_SIZE,
  style,
  testID,
  variant = 'secondary',
}: IconButtonProps) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const scale = useSharedValue(1)
  const touchSize = Math.max(MIN_TOUCH_SIZE, size)

  useEffect(() => {
    if (disabled) scale.value = withSpring(1, SPRING_CONFIG)
  }, [disabled, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const variantStyle = styles[variant]
  const tintColor = iconTint(colors, variant)

  return (
    <Animated.View
      style={[
        styles.animatedContainer,
        style,
        {
          width: touchSize,
          height: touchSize,
          minWidth: MIN_TOUCH_SIZE,
          minHeight: MIN_TOUCH_SIZE,
        },
        disabled && styles.disabled,
        animatedStyle,
      ]}
    >
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={hitSlop}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.92, SPRING_CONFIG)
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING_CONFIG)
        }}
        style={[styles.button, variantStyle]}
        testID={testID}
      >
        <Icon name={icon} size={iconSize} tintColor={tintColor} weight="semibold" />
      </Pressable>
    </Animated.View>
  )
}

function iconTint(colors: Palette, variant: IconButtonVariant): string {
  if (variant === 'primary') return colors.accentText
  if (variant === 'danger') return colors.bg
  if (variant === 'ghost') return colors.textDim
  return colors.text
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    animatedContainer: {
      minWidth: 44,
      minHeight: 44,
    },
    button: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      borderWidth: 1,
    },
    secondary: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    primary: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    danger: {
      backgroundColor: colors.red,
      borderColor: colors.red,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
    disabled: { opacity: 0.4 },
  })
)
