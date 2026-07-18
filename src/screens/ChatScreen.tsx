import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import { agentMemory, runAgentTask, verifyAgentAnswer } from '../lib/agentRuntime'
import { AgentCancelled, AgentStep, Plan, episodicSummary, markDone } from '../agent'
import { CATALOG, getModel } from '../models/catalog'
import { splitThinking } from '../lib/thinking'
import MarkdownText from '../components/MarkdownText'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import type { RootStackParamList } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'Chat'>

const STREAM_FLUSH_MS = 80 // batch token updates so we don't re-render per token

export default function ChatScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const headerHeight = useHeaderHeight()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [booted, setBooted] = useState(false)
  const [chat, setChat] = useState<Chat | null>(null)
  const [settings, setSettings] = useState<InferenceSettings | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [phase, setPhase] = useState<'idle' | 'loading-model' | 'generating'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [downloadedIds, setDownloadedIds] = useState<ModelId[]>([])
  const [agentMode, setAgentMode] = useState(false)
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])
  const [agentPlan, setAgentPlan] = useState<Plan | null>(null)
  const [verifying, setVerifying] = useState(false)
  const planRef = useRef<Plan | null>(null)
  const cancelRef = useRef(false)
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
  }, [chat?.modelId, hasMessages, colors])

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
    setAgentSteps([])
    planRef.current = null
    setAgentPlan(null)
    cancelRef.current = false
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

      if (agentMode) {
        const result = await runAgentTask(
          text,
          settings,
          () => cancelRef.current,
          (step) => {
            if (step.kind === 'plan_check') {
              const id = Number(step.content)
              if (planRef.current) {
                planRef.current = markDone(planRef.current, id)
                setAgentPlan(planRef.current)
              }
              return
            }
            setAgentSteps((prev) => [...prev, step])
          },
          (plan) => {
            planRef.current = plan
            setAgentPlan(plan)
          }
        )
        const toolCalls = result.steps.filter((s) => s.kind === 'tool_call').length

        // orchestrated runs carry their own judge verdict; single-loop runs
        // get the separate reflect+judge pass when verification is on
        let finalAnswer = result.answer
        let verifyStats: ChatMessage['stats'] = {}
        if (result.verdict) {
          verifyStats = {
            verify: {
              accept: result.verdict.accept,
              score: result.verdict.score,
              revised: result.retried,
            },
          }
        } else if (settings.verifyAnswers && !result.truncated && !cancelRef.current) {
          setVerifying(true)
          try {
            const verified = await verifyAgentAnswer(text, result.answer, settings, () => cancelRef.current)
            finalAnswer = verified.answer
            verifyStats = {
              verify: {
                accept: verified.verdict.accept,
                score: verified.verdict.score,
                revised: verified.revised,
              },
            }
          } catch {
            // verification is best-effort — a failed pass never loses the answer
          } finally {
            setVerifying(false)
          }
        }

        const assistantMsg: ChatMessage = {
          ...newMessage('assistant', finalAnswer),
          stats: verifyStats,
        }
        working = {
          ...working,
          messages: [...working.messages, assistantMsg],
          updatedAt: Date.now(),
        }
        await persist(working)
        agentMemory.add('episodic', episodicSummary(text, finalAnswer)).catch(() => {})
        if (toolCalls === 0) setAgentSteps([]) // nothing interesting to keep
        return
      }

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
      agentMemory.add('episodic', episodicSummary(text, content)).catch(() => {})
    } catch (e: any) {
      if (e instanceof AgentCancelled) setError('Stopped.')
      else setError(e?.message ?? 'Generation failed')
    } finally {
      setStreaming('')
      setPhase('idle')
    }
  }, [input, settings, phase, agentMode, persist])

  const stop = useCallback(() => {
    cancelRef.current = true
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
      {/* model picker strip + agent toggle */}
      <View style={styles.modelStripWrap}>
        <Pressable
          disabled={phase !== 'idle'}
          hitSlop={6}
          style={[styles.agentChip, agentMode && styles.agentChipActive]}
          onPress={() => setAgentMode((v) => !v)}
        >
          <Text style={[styles.agentChipText, agentMode && styles.agentChipTextActive]}>
            ⚙ Agent
          </Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modelStrip}
        >
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
        </ScrollView>
      </View>

      <FlatList
        ref={listRef}
        data={chat.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => <Bubble message={item} />}
        ListEmptyComponent={
          phase === 'idle' ? (
            <View style={styles.chatEmpty}>
              <Text style={styles.chatEmptyText}>
                Ask anything — everything runs on your phone.
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          <>
            {phase === 'loading-model' && (
              <StatusRow text={`Loading ${getModel(chat.modelId)?.name ?? 'model'}…`} spinner />
            )}
            {agentPlan && (
              <View style={styles.planPanel}>
                <Text style={styles.planTitle}>Plan</Text>
                {agentPlan.steps.map((s) => (
                  <View key={s.id} style={styles.planRow}>
                    <Text style={[styles.planBox, s.done && styles.planBoxDone]}>
                      {s.done ? '☑' : '☐'}
                    </Text>
                    <Text style={[styles.planText, s.done && styles.planTextDone]}>{s.text}</Text>
                  </View>
                ))}
              </View>
            )}
            {agentSteps.length > 0 && (
              <View style={styles.stepTimeline}>
                {agentSteps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </View>
            )}
            {phase === 'generating' && agentMode && (
              <StatusRow text={verifying ? 'Verifying answer…' : 'Agent working…'} spinner />
            )}
            {phase === 'generating' && !agentMode && streamingParts && (
              <View style={[styles.bubble, styles.assistantBubble]}>
                {streamingParts.isThinking && !streamingParts.answer ? (
                  <Text style={styles.thinkingText}>Thinking…</Text>
                ) : (
                  <Text style={styles.bubbleText}>{streamingParts.answer || ' '}</Text>
                )}
              </View>
            )}
            {phase === 'generating' && !agentMode && !streamingParts && (
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
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const isUser = message.role === 'user'
  const verify = message.stats?.verify
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      {isUser ? (
        <Text style={styles.bubbleText}>{message.content}</Text>
      ) : (
        <MarkdownText text={message.content} />
      )}
      {message.stats?.tokensPerSecond ? (
        <Text style={styles.statsText}>
          {message.stats.tokensPerSecond.toFixed(1)} tok/s
          {message.stats.predictedTokens ? ` · ${message.stats.predictedTokens} tok` : ''}
        </Text>
      ) : null}
      {verify ? (
        <Text style={[styles.verifyBadge, { color: verify.accept ? colors.green : colors.yellow }]}>
          {verify.accept ? '✓ verified' : '⚠ judge'} {verify.score}/10
          {verify.revised ? ' · revised' : ''}
        </Text>
      ) : null}
    </View>
  )
}

function StatusRow({ text, spinner }: { text: string; spinner?: boolean }) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  return (
    <View style={styles.statusRow}>
      {spinner && <ActivityIndicator size="small" color={colors.accent} />}
      <Text style={styles.statusText}>{text}</Text>
    </View>
  )
}

function StepRow({ step }: { step: AgentStep }) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const icon =
    step.kind === 'thought' ? '💭' : step.kind === 'tool_call' ? '🔧' : step.kind === 'observation' ? '↳' : step.kind === 'error' ? '⚠' : step.kind === 'subtask' ? '▶' : '✓'
  const label =
    step.kind === 'tool_call'
      ? `${step.tool} ${step.content}`
      : step.content
  if (step.kind === 'final' || step.kind === 'plan_check') return null // shown elsewhere
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepIcon}>{icon}</Text>
      <Text
        style={[
          styles.stepText,
          step.kind === 'error' && { color: colors.red },
          step.kind === 'subtask' && { color: colors.text, fontWeight: '600' },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
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
  modelStripWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  agentChip: {
    marginLeft: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  agentChipActive: { backgroundColor: colors.green, borderColor: colors.green },
  agentChipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  agentChipTextActive: { color: colors.bg },
  stepTimeline: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  stepRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepIcon: { fontSize: 12, width: 18, textAlign: 'center' },
  stepText: { color: colors.textDim, fontSize: 12, flex: 1, lineHeight: 17 },
  planPanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  planTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  planRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  planBox: { color: colors.textFaint, fontSize: 13, width: 18 },
  planBoxDone: { color: colors.green },
  planText: { color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
  planTextDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  modelStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chatEmpty: { alignItems: 'center', paddingTop: 120, paddingHorizontal: spacing.xl },
  chatEmptyText: { color: colors.textFaint, fontSize: 14, textAlign: 'center' },
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
  verifyBadge: { fontSize: 11, fontWeight: '700', marginTop: spacing.xs },
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
)
