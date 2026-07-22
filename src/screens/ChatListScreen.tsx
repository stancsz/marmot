import React, { useCallback, useLayoutEffect, useState } from 'react'
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
import { Chat } from '../types'
import { deleteChat, loadChats } from '../lib/chatStore'
import { shareChatAsJson, shareChatAsMarkdown } from '../lib/exportShare'
import { loadCustomModels, resolveModel } from '../lib/customModels'
import { chatPreview } from '../lib/chatPreview'
import ChatHistoryDrawer from '../components/ChatHistoryDrawer'
import IconButton from '../components/IconButton'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import type { RootStackParamList } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function ChatListScreen() {
  const navigation = useNavigation<Nav>()
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [chats, setChats] = useState<Chat[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <IconButton
          accessibilityLabel="Open navigation"
          hitSlop={8}
          icon="menu"
          onPress={() => setDrawerOpen(true)}
          variant="ghost"
        />
      ),
    })
  }, [navigation])

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
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
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
          const preview = last ? chatPreview(last.content, undefined, last.role) : ''
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open chat ${item.title}`}
              style={styles.card}
              onPress={() => navigation.navigate('Chat', { chatId: item.id })}
              onLongPress={() => onChatMenu(item)}
            >
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {preview ? (
                <Text style={styles.cardPreview} numberOfLines={2}>
                  {preview}
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
      <ChatHistoryDrawer
        chats={chats}
        onActions={() => {
          setDrawerOpen(false)
          navigation.navigate('Ingest')
        }}
        onClose={() => setDrawerOpen(false)}
        onFlightMode={() => {
          setDrawerOpen(false)
          navigation.navigate('Flight')
        }}
        onLongPressChat={onChatMenu}
        onModels={() => {
          setDrawerOpen(false)
          navigation.navigate('Models')
        }}
        onNewChat={() => {
          setDrawerOpen(false)
          navigation.navigate('Chat', {})
        }}
        onSelectChat={(chat) => {
          setDrawerOpen(false)
          navigation.navigate('Chat', { chatId: chat.id })
        }}
        onSettings={() => {
          setDrawerOpen(false)
          navigation.navigate('Settings')
        }}
        visible={drawerOpen}
      />
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
      borderCurve: 'continuous',
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
  })
)
