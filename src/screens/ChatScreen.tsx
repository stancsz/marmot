import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useHeaderHeight } from '@react-navigation/elements'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Chat, ChatMessage, InferenceSettings, ModelId } from '../types'
import {
  chatTitleFrom,
  loadChats,
  loadSettings,
  newChat,
  newMessage,
  saveChat,
} from '../lib/chatStore'
import { engine } from '../lib/engine'
import { downloads } from '../lib/downloads'
import { shareChatAsMarkdown } from '../lib/exportShare'
import { CATALOG, getModel } from '../models/catalog'
import { splitThinking } from '../lib/thinking'
import { colors, radius, spacing } from '../theme'
import type { RootStackParamList } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'Chat'>

const STREAM_FLUSH_MS = 80 // batch token updates so we don't re-render per token

export default function ChatScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const headerHeight = useHeaderHeight()
  const insets = useSafeAreaInsets()
  const [booted, setBooted] = useState(false)
  const [chat, setChat] = useState<Chat | null>(null)
  const [settings, setSettings] = useState<InferenceSettings | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [phase, setPhase] = useState<'idle' | 'loading-model' | 'generating'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [downloadedIds, setDownloadedIds] = useState<ModelId[]>([])
  const listRef = useRef<FlatList>(null)
  const chatRef = useRef<Chat | null>(null)
  chatRef.current = chat

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    ;(async () => {
      await downloads.init()
      if (cancelled) return
      unsub = downloads.subscribe(() => {
        const ids = downloads.downloadedModelIds()
        setDownloadedIds(ids)
        // adopt an available model if this chat has none, or if its model
        // was deleted from the device
        const current = chatRef.current
        if (
          current &&
          ids.length > 0 &&
          (!current.modelId || !ids.includes(current.modelId))
        ) {
          const next = { ...current, modelId: ids[0] }
          setChat(next)
          saveChat(next)
        }
      })
      setSettings(await loadSettings())
      if (route.params?.chatId) {
        const chats = await loadChats()
        const found = chats.find((c) => c.id === route.params.chatId)
        if (found) {
          if (!cancelled) {
            setChat(found)
            setBooted(true)
          }
          return
        }
      }
      if (cancelled) return
      const ids = downloads.downloadedModelIds()
      const loaded = engine.getLoadedModelId()
      const preferred = loaded && ids.includes(loaded) ? loaded : ids[0] ?? null
      setChat(newChat(preferred))
      setBooted(true)
    })()
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [route.params?.chatId])

  // settings can change while this screen stays mounted (Settings is pushed
  // on top) — refresh them whenever the chat regains focus
  useFocusEffect(
    useCallback(() => {
      loadSettings().then(setSettings)
    }, [])
  )

  const hasMessages = (chat?.messages.length ?? 0) > 0
  useEffect(() => {
    const model = getModel(chat?.modelId)
    navigation.setOptions({
      title: model ? model.name : 'Chat',
      headerRight: hasMessages
        ? () => (
            <Pressable
              hitSlop={12}
              onPress={() => {
                const current = chatRef.current
                if (current) shareChatAsMarkdown(current).catch(() => {})
              }}
            >
              <Text style={{ color: colors.textDim, fontSize: 15 }}>Share</Text>
            </Pressable>
          )
        : undefined,
    })
  }, [chat?.modelId, hasMessages])

  const persist = useCallback(async (next: Chat) => {
    setChat(next)
    await saveChat(next)
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    const current = chatRef.current
    if (!text || !current || !current.modelId || !settings) return
    if (phase !== 'idle') return

    setError(null)
    setInput('')
    const userMsg = newMessage('user', text)
    let working: Chat = {
      ...current,
      title: current.messages.length === 0 ? chatTitleFrom(text) : current.title,
      messages: [...current.messages, userMsg],
      updatedAt: Date.now(),
    }
    await persist(working)

    try {
      setPhase('loading-model')
      await engine.ensureLoaded(working.modelId!, settings.contextLength)
      setPhase('generating')
      setStreaming('')

      const history = [
        { role: 'system' as const, content: settings.systemPrompt },
        ...working.messages.map((m) => ({ role: m.role, content: m.content })),
      ]
      let acc = ''
      let lastFlush = 0
      const result = await engine.complete(history, settings, (token) => {
        acc += token
        const now = Date.now()
        if (now - lastFlush >= STREAM_FLUSH_MS) {
          lastFlush = now
          setStreaming(acc)
        }
      })

      // never persist raw <think> tags: if the model was stopped mid-
      // reasoning and produced no answer, fall back to the stripped
      // reasoning text rather than the tagged raw stream
      const parts = splitThinking(result.text || acc)
      const content = parts.answer || parts.thinking.trim() || '(empty response)'
      const assistantMsg: ChatMessage = {
        ...newMessage('assistant', content),
        stats: result.stats,
      }
      working = {
        ...working,
        messages: [...working.messages, assistantMsg],
        updatedAt: Date.now(),
      }
      await persist(working)
    } catch (e: any) {
      setError(e?.message ?? 'Generation failed')
    } finally {
      setStreaming('')
      setPhase('idle')
    }
  }, [input, settings, phase, persist])

  const stop = useCallback(() => {
    engine.stop()
  }, [])

  if (!booted || !chat || !settings) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  // No model downloaded at all → point to the library
  if (downloadedIds.length === 0) {
    return (
      <View style={[styles.container, styles.center, { padding: spacing.xl }]}>
        <Text style={styles.bigText}>No models yet</Text>
        <Text style={styles.dimText}>
          Download a model to start chatting. Everything runs on-device.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('Models')}>
          <Text style={styles.primaryBtnText}>Open model library</Text>
        </Pressable>
      </View>
    )
  }

  const streamingParts = streaming ? splitThinking(streaming) : null

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {/* model picker strip */}
      <View style={styles.modelStrip}>
        {CATALOG.filter((m) => downloadedIds.includes(m.id)).map((m) => {
          const active = chat.modelId === m.id
          return (
            <Pressable
              key={m.id}
              disabled={phase !== 'idle'}
              hitSlop={6}
              style={[styles.modelChip, active && styles.modelChipActive]}
              onPress={() => persist({ ...chat, modelId: m.id })}
            >
              <Text style={[styles.modelChipText, active && styles.modelChipTextActive]}>
                {m.name}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <FlatList
        ref={listRef}
        data={chat.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => <Bubble message={item} />}
        ListFooterComponent={
          <>
            {phase === 'loading-model' && (
              <StatusRow text={`Loading ${getModel(chat.modelId)?.name ?? 'model'}…`} spinner />
            )}
            {phase === 'generating' && streamingParts && (
              <View style={[styles.bubble, styles.assistantBubble]}>
                {streamingParts.isThinking && !streamingParts.answer ? (
                  <Text style={styles.thinkingText}>Thinking…</Text>
                ) : (
                  <Text style={styles.bubbleText}>{streamingParts.answer || ' '}</Text>
                )}
              </View>
            )}
            {phase === 'generating' && !streamingParts && (
              <StatusRow text="…" spinner />
            )}
            {error && <Text style={styles.errorText}>{error}</Text>}
          </>
        }
      />

      <View style={[styles.inputRow, { paddingBottom: spacing.md + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor={colors.textFaint}
          value={input}
          onChangeText={setInput}
          multiline
          editable={phase !== 'generating'}
        />
        {phase === 'generating' ? (
          <Pressable style={[styles.sendBtn, styles.stopBtn]} onPress={stop}>
            <Text style={styles.sendBtnText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim() || phase !== 'idle'}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      <Text style={styles.bubbleText}>{message.content}</Text>
      {message.stats?.tokensPerSecond ? (
        <Text style={styles.statsText}>
          {message.stats.tokensPerSecond.toFixed(1)} tok/s
          {message.stats.predictedTokens ? ` · ${message.stats.predictedTokens} tok` : ''}
        </Text>
      ) : null}
    </View>
  )
}

function StatusRow({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <View style={styles.statusRow}>
      {spinner && <ActivityIndicator size="small" color={colors.accent} />}
      <Text style={styles.statusText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  bigText: { color: colors.text, fontSize: 22, fontWeight: '700' },
  dimText: { color: colors.textDim, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  primaryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  primaryBtnText: { color: colors.accentText, fontWeight: '700', fontSize: 16 },
  modelStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modelChipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  modelChipTextActive: { color: colors.accentText },
  bubble: {
    maxWidth: '88%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.userBubble },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.assistantBubble,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  thinkingText: { color: colors.textFaint, fontSize: 14, fontStyle: 'italic' },
  statsText: { color: colors.textFaint, fontSize: 11, marginTop: spacing.xs },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  statusText: { color: colors.textDim, fontSize: 13 },
  errorText: { color: colors.red, fontSize: 13, padding: spacing.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 44,
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  stopBtn: { backgroundColor: colors.red },
  sendBtnText: { color: colors.accentText, fontWeight: '700', fontSize: 15 },
})
