import React, { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import Icon, { IconName } from './Icon'

/** A single choice presented by a native-feeling menu selector. */
export interface SelectMenuOption {
  id: string
  label: string
  detail?: string
  disabled?: boolean
}

/** Props for a reusable dropdown selector used by chat and settings. */
export interface SelectMenuProps {
  accessibilityLabel: string
  disabled?: boolean
  leadingIcon?: IconName
  onSelect: (id: string) => void | Promise<void>
  options: SelectMenuOption[]
  selectedId: string | null
  title: string
}

/**
 * Renders a compact trigger and an accessible modal menu for single-choice
 * values. The menu uses a full-screen scrim so it remains reliable on both
 * iOS and Android without relying on platform-specific popover geometry.
 */
export default function SelectMenu({
  accessibilityLabel,
  disabled = false,
  leadingIcon,
  onSelect,
  options,
  selectedId,
  title,
}: SelectMenuProps) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.id === selectedId)

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.trigger, disabled && styles.disabled]}
      >
        {leadingIcon ? <Icon name={leadingIcon} size={18} tintColor={colors.textDim} /> : null}
        <View style={styles.triggerCopy}>
          <Text style={styles.triggerTitle} numberOfLines={1}>{selected?.label ?? title}</Text>
          {selected?.detail ? <Text style={styles.triggerDetail} numberOfLines={1}>{selected.detail}</Text> : null}
        </View>
        <Icon name="chevronDown" size={18} tintColor={colors.textDim} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityViewIsModal
          onPress={() => setOpen(false)}
          style={[styles.scrim, { paddingTop: insets.top + spacing.lg }]}
        >
          <Pressable style={styles.menu} onPress={(event) => event.stopPropagation()}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>{title}</Text>
              <Pressable
                accessibilityLabel="Close menu"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setOpen(false)}
                style={styles.closeButton}
              >
                <Icon name="close" size={18} tintColor={colors.textDim} />
              </Pressable>
            </View>
            <View style={styles.optionList}>
              {options.map((option) => {
                const active = option.id === selectedId
                return (
                  <Pressable
                    key={option.id}
                    accessibilityLabel={option.detail ? `${option.label}, ${option.detail}` : option.label}
                    accessibilityRole="menuitem"
                    accessibilityState={{ disabled: option.disabled, selected: active }}
                    disabled={option.disabled}
                    onPress={() => {
                      setOpen(false)
                      void onSelect(option.id)
                    }}
                    style={[styles.option, active && styles.optionActive, option.disabled && styles.disabled]}
                  >
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]} numberOfLines={1}>
                        {option.label}
                      </Text>
                      {option.detail ? <Text style={styles.optionDetail} numberOfLines={1}>{option.detail}</Text> : null}
                    </View>
                    <View style={styles.checkSlot}>
                      {active ? <Icon name="check" size={18} tintColor={colors.accent} /> : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    trigger: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderCurve: 'continuous',
    },
    triggerCopy: { flex: 1, minWidth: 0, gap: 2 },
    triggerTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    triggerDetail: { color: colors.textFaint, fontSize: 11 },
    disabled: { opacity: 0.45 },
    scrim: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      paddingHorizontal: spacing.lg,
    },
    menu: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '76%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
      overflow: 'hidden',
    },
    menuHeader: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
    closeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    optionList: { padding: spacing.sm, gap: spacing.xs },
    option: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderCurve: 'continuous',
    },
    optionActive: { backgroundColor: colors.surfaceAlt },
    optionCopy: { flex: 1, minWidth: 0, gap: 2 },
    optionLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
    optionLabelActive: { color: colors.accent },
    optionDetail: { color: colors.textFaint, fontSize: 11 },
    checkSlot: { width: 24, alignItems: 'center' },
  })
)
