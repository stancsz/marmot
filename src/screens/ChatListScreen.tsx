import React, { useCallback, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Chat } from '../types'
import { deleteChat, loadChats } from '../lib/chatStore'
import { shareChatAsJson, shareChatAsMarkdown } from '../lib/exportShare'
import { loadCustomModels, resolveModel } from '../lib/customModels'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import type { RootStackParamList } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function ChatListScreen() {
  const navigation = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [chats, setChats] = useState<Chat[]>([])

  useFocusEffect(
    useCallback(() => {
      // hydrate the custom-model cache first so imported-model badges resolve
      loadCustomModels().then(() => loadChats().then(setChats))
    }, [])
  )

  const onChatMenu = (chat: Chat) => {
    Alert.alert(chat.title, undefined, [
      {
        text: 'Share as Markdown',
        onPress: () => shareChatAsMarkdown(chat).catch((e) => Alert.alert('Share failed', e.message)),
      },
      {
        text: 'Export as JSON',
        onPress: () => shareChatAsJson(chat).catch((e) => Alert.alert('Export failed', e.message)),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteChat(chat.id)
          setChats(await loadChats())
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptyText}>
              Private AI chat that runs entirely on your phone. No account, no
              cloud, works in airplane mode.
            </Text>
            <Text style={styles.emptyText}>
              Grab a model from the library to get started.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('Models')}
            >
              <Text style={styles.primaryBtnText}>Browse models</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const model = resolveModel(item.modelId)
          const last = item.messages[item.messages.length - 1]
          return (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('Chat', { chatId: item.id })}
              onLongPress={() => onChatMenu(item)}
            >
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {last ? (
                <Text style={styles.cardPreview} numberOfLines={2}>
                  {last.content.replace(/\s+/g, ' ')}
                </Text>
              ) : null}
              <View style={styles.cardMeta}>
                {model ? <Text style={styles.badge}>{model.name}</Text> : null}
                <Text style={styles.cardDate}>
                  {new Date(item.updatedAt).toLocaleDateString()}
                </Text>
              </View>
            </Pressable>
          )
        }}
      />
      <View style={[styles.fabRow, { bottom: spacing.xl + insets.bottom }]}>
        <Pressable
          style={[styles.fab, styles.fabSecondary]}
          onPress={() => navigation.navigate('Models')}
        >
          <Text style={styles.fabSecondaryText}>Models</Text>
        </Pressable>
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate('Chat', {})}
        >
          <Text style={styles.fabText}>New chat</Text>
        </Pressable>
      </View>
    </View>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
    emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
    emptyText: {
      color: colors.textDim,
      fontSize: 15,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 300,
    },
    primaryBtn: {
      marginTop: spacing.md,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.pill,
    },
    primaryBtnText: { color: colors.accentText, fontWeight: '700', fontSize: 16 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.xs,
    },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    cardPreview: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
    cardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xs,
    },
    badge: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '600',
    },
    cardDate: { color: colors.textFaint, fontSize: 12 },
    fabRow: {
      position: 'absolute',
      right: spacing.lg,
      flexDirection: 'row',
      gap: spacing.md,
    },
    fab: {
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.xl,
      paddingVertical: 14,
      borderRadius: radius.pill,
      elevation: 4,
    },
    fabText: { color: colors.accentText, fontWeight: '700', fontSize: 15 },
    fabSecondary: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fabSecondaryText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  })
)
