import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Attachment } from '../types'
import { attachmentCapabilityLabel, type AttachmentCapabilities } from '../lib/attachmentContext'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import Icon from './Icon'
import type { IconName } from './Icon'
import IconButton from './IconButton'

/** Props for the pending attachment summary shown above the composer. */
export interface AttachmentChipProps {
  attachment: Attachment
  capabilities?: AttachmentCapabilities
  onClear?: () => void
}

/** Displays an attachment's type, truncated filename, size, and clear action. */
export default function AttachmentChip({
  attachment,
  capabilities,
  onClear,
}: AttachmentChipProps) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const icon = iconFor(attachment.mimeType)
  const sizeLabel = formatSize(attachment.sizeBytes)

  return (
    <View style={styles.row}>
      <View style={styles.chip}>
        <Icon name={icon} size={16} tintColor={colors.textDim} />
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="middle">
            {attachment.name}
          </Text>
          <Text style={styles.capability} numberOfLines={1}>
            {attachmentCapabilityLabel(attachment, capabilities)}
          </Text>
        </View>
        <Text style={styles.size} numberOfLines={1}>
          {sizeLabel}
        </Text>
      </View>
      {onClear ? (
        <IconButton
          accessibilityLabel="Remove attachment"
          hitSlop={4}
          icon="close"
          iconSize={17}
          onPress={onClear}
          variant="ghost"
        />
      ) : null}
    </View>
  )
}

function iconFor(mimeType: string): IconName {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'file'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    row: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    chip: {
      minWidth: 0,
      flex: 1,
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
    meta: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    name: {
      minWidth: 0,
      flex: 1,
      color: colors.text,
      fontSize: 13,
    },
    size: {
      flexShrink: 0,
      color: colors.textFaint,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    capability: {
      color: colors.textFaint,
      fontSize: 11,
    },
  })
)
