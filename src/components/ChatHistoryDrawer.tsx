import React, { useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { SlideInLeft } from 'react-native-reanimated'
import { Chat } from '../types'
import { chatPreview } from '../lib/chatPreview'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import Icon from './Icon'
import IconButton from './IconButton'

interface ChatHistoryDrawerProps {
  chats: Chat[]
  onActions: () => void
  onClose: () => void
  onFlightMode: () => void
  onLongPressChat: (chat: Chat) => void
  onModels: () => void
  onNewChat: () => void
  onSelectChat: (chat: Chat) => void
  onSettings: () => void
  visible: boolean
}

interface ChatSection {
  title: string
  data: Chat[]
}

/**
 * Mobile navigation drawer for chat history and high-frequency destinations.
 * History is grouped by recency and searchable without leaving the current
 * screen, matching the navigation model users expect from assistant apps.
 */
export default function ChatHistoryDrawer({
  chats,
  onActions,
  onClose,
  onFlightMode,
  onLongPressChat,
  onModels,
  onNewChat,
  onSelectChat,
  onSettings,
  visible,
}: ChatHistoryDrawerProps) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [query, setQuery] = useState('')
  const sections = useMemo(() => makeSections(chats, query), [chats, query])
  const drawerWidth = Math.min(336, Math.round(width * 0.86))

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close navigation" style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={SlideInLeft.duration(240)}
          style={[styles.drawer, { width: drawerWidth, paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom }]}
        >
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>M</Text>
              </View>
              <Text style={styles.brand}>Marmot</Text>
            </View>
            <IconButton accessibilityLabel="Close navigation" icon="close" onPress={onClose} variant="ghost" />
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Start a new chat" onPress={onNewChat} style={styles.newChat}>
            <Icon name="plus" size={19} tintColor={colors.text} weight="semibold" />
            <Text style={styles.newChatText}>New chat</Text>
          </Pressable>

          <View style={styles.searchBox}>
            <Icon name="research" size={18} tintColor={colors.textDim} />
            <TextInput
              accessibilityLabel="Search chat history"
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats"
              placeholderTextColor={colors.textDim}
              style={styles.searchInput}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          <SectionList
            contentInsetAdjustmentBehavior="automatic"
            sections={sections}
            keyExtractor={(chat) => chat.id}
            keyboardShouldPersistTaps="handled"
            style={styles.history}
            contentContainerStyle={styles.historyContent}
            renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
            renderItem={({ item }) => {
              const last = item.messages[item.messages.length - 1]
              const preview = last ? chatPreview(last.content, 72, last.role) : 'No messages yet'
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open chat ${item.title}`}
                  onPress={() => onSelectChat(item)}
                  onLongPress={() => onLongPressChat(item)}
                  style={styles.historyItem}
                >
                  <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
                  {preview ? (
                    <Text style={styles.historyPreview} numberOfLines={1}>
                      {preview}
                    </Text>
                  ) : null}
                </Pressable>
              )
            }}
            ListEmptyComponent={<Text style={styles.emptyHistory}>{query ? 'No matching chats' : 'Your chats will appear here'}</Text>}
          />

          <View style={styles.footer}>
            <DrawerLink icon="flight" label="Flight mode" onPress={onFlightMode} />
            <DrawerLink icon="quickActions" label="Quick actions" onPress={onActions} />
            <DrawerLink icon="models" label="Model library" onPress={onModels} />
            <DrawerLink icon="settings" label="Settings" onPress={onSettings} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

function DrawerLink({ icon, label, onPress }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; onPress: () => void }) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.footerLink}>
      <Icon name={icon} size={19} tintColor={colors.textDim} />
      <Text style={styles.footerLinkText}>{label}</Text>
    </Pressable>
  )
}

function makeSections(chats: Chat[], query: string): ChatSection[] {
  const normalized = query.trim().toLowerCase()
  const filtered = chats
    .filter((chat) => {
      if (!normalized) return true
      const last = chat.messages[chat.messages.length - 1]
      return `${chat.title} ${last?.content ?? ''}`.toLowerCase().includes(normalized)
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const now = startOfDay(Date.now())
  const buckets: ChatSection[] = [
    { title: 'Today', data: [] },
    { title: 'Yesterday', data: [] },
    { title: 'Previous 7 days', data: [] },
    { title: 'Older', data: [] },
  ]

  for (const chat of filtered) {
    const age = Math.floor((now - startOfDay(chat.updatedAt)) / 86_400_000)
    const bucket = age <= 0 ? buckets[0] : age === 1 ? buckets[1] : age <= 7 ? buckets[2] : buckets[3]
    bucket.data.push(chat)
  }
  return buckets.filter((section) => section.data.length > 0)
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    overlay: { flex: 1, flexDirection: 'row' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.18)' },
    drawer: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: colors.bg,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      boxShadow: '2px 0 12px rgba(0, 0, 0, 0.08)',
    },
    header: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    brandMark: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      borderCurve: 'continuous',
      backgroundColor: colors.accent,
    },
    brandMarkText: { color: colors.accentText, fontSize: 16, fontWeight: '800' },
    brand: { color: colors.text, fontSize: 17, fontWeight: '700' },
    newChat: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.md,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
    },
    newChatText: { color: colors.text, fontSize: 14, fontWeight: '700' },
    searchBox: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
    },
    searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, paddingVertical: spacing.sm },
    history: { flex: 1, marginTop: spacing.md },
    historyContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    sectionTitle: {
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      color: colors.textFaint,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    historyItem: {
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      borderCurve: 'continuous',
    },
    historyTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
    historyPreview: { color: colors.textDim, fontSize: 12 },
    emptyHistory: { padding: spacing.lg, color: colors.textFaint, fontSize: 13, textAlign: 'center' },
    footer: {
      gap: spacing.xs,
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
    },
    footerLink: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      borderCurve: 'continuous',
    },
    footerLinkText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  })
)
