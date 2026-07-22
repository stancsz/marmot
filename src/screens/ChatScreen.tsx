import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutUp, LinearTransition } from 'react-native-reanimated'
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useHeaderHeight } from '@react-navigation/elements'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Attachment, Chat, ChatMessage, InferenceSettings, ModelId, ModelSpec } from '../types'
import {
  chatTitleFrom,
  loadChats,
  loadSettings,
  newChat,
  newMessage,
  saveChat,
} from '../lib/chatStore'
import { engine } from '../lib/engine'
import { ramFit } from '../lib/deviceMemory'
import { downloads } from '../lib/downloads'
import { shareChatAsMarkdown } from '../lib/exportShare'
import { agentMemory, runAgentTask, verifyAgentAnswer } from '../lib/agentRuntime'
import { AgentCancelled, AgentStep, Plan, episodicSummary, markDone } from '../agent'
import { CATALOG, hasVision, totalDownloadBytes } from '../models/catalog'
import { customModelsCache, loadCustomModels, resolveModel } from '../lib/customModels'
import { splitThinking } from '../lib/thinking'
import { useKeyboardHeight } from '../lib/useKeyboardHeight'
import { buildResearchTask } from '../lib/textActions'
import { pickAttachment } from '../lib/attachments'
import {
  buildCompletionMessages,
  loadAttachmentContext,
  type AttachmentCapabilities,
} from '../lib/attachmentContext'
import { LOCAL_DEMO_PROMPT, LOCAL_DEMO_PROOF } from '../lib/localDemo'
import MarkdownText from '../components/MarkdownText'
import AttachmentButton from '../components/AttachmentButton'
import AttachmentChip from '../components/AttachmentChip'
import Icon from '../components/Icon'
import type { IconName } from '../components/Icon'
import IconButton from '../components/IconButton'
import SelectMenu from '../components/SelectMenu'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import { CHAT_MOTION, CHAT_TOUCH_TARGET, COMPOSER_MIN_HEIGHT, composerAction } from '../lib/chatUi'
import type { RootStackParamList } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'Chat'>

const STREAM_FLUSH_MS = 80 // batch token updates so we don't re-render per token

function confirmRiskyLoad(modelName: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'This model may be too big',
      `${modelName} may run very slowly, or the device may run out of memory, given how much RAM is available. Continue anyway?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
      ]
    )
  })
}

export default function ChatScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const demoRequested = route.params?.demo === true
  const headerHeight = useHeaderHeight()
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [booted, setBooted] = useState(false)
  const [chat, setChat] = useState<Chat | null>(null)
  const [settings, setSettings] = useState<InferenceSettings | null>(null)
  const [input, setInput] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null)
  const [streaming, setStreaming] = useState('')
  const [phase, setPhase] = useState<'idle' | 'loading-model' | 'generating'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [downloadedIds, setDownloadedIds] = useState<ModelId[]>([])
  const [customModels, setCustomModels] = useState<ModelSpec[]>([])
  const [agentMode, setAgentMode] = useState(false)
  const [deepResearch, setDeepResearch] = useState(false)
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])
  const [agentPlan, setAgentPlan] = useState<Plan | null>(null)
  const [verifying, setVerifying] = useState(false)
  const planRef = useRef<Plan | null>(null)
  const cancelRef = useRef(false)
  const listRef = useRef<FlatList>(null)
  const chatRef = useRef<Chat | null>(null)
  chatRef.current = chat
  const openChatIdRef = useRef<string | null>(null)

  // React Navigation reuses this screen instance across different chats
  // (navigate() with a new chatId re-renders rather than remounting), so a
  // busy 'phase' left over from a chat the user abandoned mid-reply would
  // otherwise leak in and disable Send/Agent/model chips in the new chat.
  // Kill the stale generation and unblock the UI the moment the displayed
  // chat actually changes.
  useEffect(() => {
    const id = chat?.id ?? null
    if (openChatIdRef.current !== null && openChatIdRef.current !== id) {
      cancelRef.current = true
      engine.stop().catch(() => {})
      setPhase('idle')
      setStreaming('')
      setAgentSteps([])
      setAgentPlan(null)
      planRef.current = null
      setError(null)
    }
    openChatIdRef.current = id
  }, [chat?.id])

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    ;(async () => {
      await downloads.init()
      const custom = await loadCustomModels() // hydrate before the adopt-guard runs
      if (cancelled) return
      setCustomModels(custom)
      unsub = downloads.subscribe(() => {
        const ids = downloads.downloadedModelIds()
        setDownloadedIds(ids)
        // adopt an available model if this chat has none, or if its model
        // was deleted from the device — imported models count as available
        const knownIds = [...ids, ...customModelsCache().map((m) => m.id)]
        const current = chatRef.current
        if (
          current &&
          knownIds.length > 0 &&
          (!current.modelId || !knownIds.includes(current.modelId))
        ) {
          const next = { ...current, modelId: knownIds[0] }
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
      loadCustomModels().then(setCustomModels)
    }, [])
  )

  const hasMessages = (chat?.messages.length ?? 0) > 0
  useEffect(() => {
    const model = resolveModel(chat?.modelId)
    navigation.setOptions({
      title: model ? model.name : 'Chat',
      headerRight: hasMessages
        ? () => (
            <IconButton
              accessibilityLabel="Share chat"
              hitSlop={8}
              icon="share"
              onPress={() => {
                const current = chatRef.current
                if (current) shareChatAsMarkdown(current).catch(() => {})
              }}
              variant="ghost"
            />
          )
        : undefined,
    })
  }, [chat?.modelId, hasMessages, colors])

  const persist = useCallback(async (next: Chat) => {
    setChat(next)
    await saveChat(next)
  }, [])

  const send = useCallback(async (promptOverride?: string) => {
    const text = (promptOverride ?? input).trim()
    const current = chatRef.current
    const attachment = pendingAttachment
    if ((!text && !attachment) || !current || !current.modelId || !settings) return
    if (phase !== 'idle') return

    // loading a different model is the expensive, risky step — warn before
    // committing rather than after the user is stuck watching a spinner.
    // Confirmed on-device: an oversized model can wedge the native decoder
    // in swap thrashing badly enough that even Stop stops responding.
    if (engine.getLoadedModelId() !== current.modelId) {
      const spec = resolveModel(current.modelId)
      if (spec && ramFit(totalDownloadBytes(spec)) === 'risky' && !(await confirmRiskyLoad(spec.name))) {
        return
      }
    }

    if (agentMode && attachment?.mimeType.startsWith('image/')) {
      setError('Image understanding is available in Chat mode. Turn off Agent to use it.')
      return
    }

    setError(null)
    setInput('')
    setPendingAttachment(null)
    setAgentSteps([])
    planRef.current = null
    setAgentPlan(null)
    cancelRef.current = false
    const userMsg = newMessage('user', text || (attachment ? `Attached: ${attachment.name}` : ''), attachment ?? undefined)
    let working: Chat = {
      ...current,
      title: current.messages.length === 0 ? chatTitleFrom(text || attachment?.name || '') : current.title,
      messages: [...current.messages, userMsg],
      updatedAt: Date.now(),
    }
    let sendStage = 'saving the message'

    try {
      await persist(working)
      sendStage = 'loading the model'
      setPhase('loading-model')
      await engine.ensureLoaded(working.modelId!, settings.contextLength, {
        gpuAndroid: settings.gpuAndroid,
      })
      const loadedModalities = engine.getLoadedModalities()
      sendStage = 'preparing the response'
      setPhase('generating')
      setStreaming('')

      if (agentMode) {
        sendStage = 'reading the attachment'
        const attachmentContext = attachment
          ? await loadAttachmentContext(attachment, loadedModalities)
          : null
        const task = [
          text || (attachment ? `Please help me with ${attachment.name}.` : ''),
          attachmentContext?.prompt,
        ].filter(Boolean).join('\n\n')
        const result = await runAgentTask(
          deepResearch && settings.allowWeb ? buildResearchTask(task) : task,
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

      sendStage = 'building the conversation'
      const history = [
        { role: 'system' as const, content: settings.systemPrompt },
        ...(await buildCompletionMessages(working.messages, loadedModalities)),
      ]
      const isLocalDemo = promptOverride === LOCAL_DEMO_PROMPT
      const hasLocalAttachment = working.messages.some((message) => Boolean(message.attachment))
      const completionSettings = isLocalDemo
        ? { ...settings, maxTokens: Math.min(settings.maxTokens, 64) }
        : hasLocalAttachment
          ? { ...settings, maxTokens: Math.min(settings.maxTokens, 128) }
          : settings
      sendStage = 'generating the response'
      let acc = ''
      let lastFlush = 0
      const result = await engine.complete(history, completionSettings, (token) => {
        acc += token
        const now = Date.now()
        if (now - lastFlush >= STREAM_FLUSH_MS) {
          lastFlush = now
          setStreaming(acc)
        }
      }, isLocalDemo || hasLocalAttachment ? { enableThinking: false } : undefined)

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
      sendStage = 'saving the response'
      await persist(working)
      agentMemory.add('episodic', episodicSummary(text, content)).catch(() => {})
    } catch (e: any) {
      if (e instanceof AgentCancelled) setError('Stopped.')
      else {
        console.error('[ChatScreen] send failed', sendStage, e?.stack ?? e)
        setError(e?.message ?? `Could not finish while ${sendStage}.`)
      }
    } finally {
      setStreaming('')
      setPhase('idle')
    }
  }, [input, pendingAttachment, settings, phase, agentMode, persist])

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

  // No model downloaded or imported at all → point to the library
  if (downloadedIds.length === 0 && customModels.length === 0) {
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
  const availableModels = [...CATALOG.filter((m) => downloadedIds.includes(m.id)), ...customModels]
  const selectedModel = resolveModel(chat.modelId)
  const selectedModelReady = Boolean(
    chat.modelId &&
      (downloadedIds.includes(chat.modelId) || customModels.some((model) => model.id === chat.modelId))
  )
  const attachmentCapabilities: AttachmentCapabilities = {
    // The selected, fully downloaded vision model is ready to inspect an
    // image when sent; the engine itself is loaded lazily at send time.
    vision: Boolean(
      selectedModel &&
        hasVision(selectedModel) &&
        ((engine.getLoadedModelId() === chat.modelId && engine.getLoadedModalities().vision) || selectedModelReady)
    ),
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {/* model selector + agent modes */}
      <Animated.View
        entering={FadeIn.duration(CHAT_MOTION.enter)}
        layout={LinearTransition.duration(CHAT_MOTION.layout)}
        style={styles.modelToolbar}
      >
        <SelectMenu
          accessibilityLabel="Choose model"
          disabled={phase !== 'idle'}
          leadingIcon="models"
          onSelect={(modelId) => persist({ ...chat, modelId })}
          options={availableModels.map((model) => ({
            id: model.id,
            label: model.name,
            detail: `${model.params} · ${model.quant}`,
          }))}
          selectedId={chat.modelId}
          title="Model"
        />
        <View style={styles.modeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: phase !== 'idle', selected: agentMode }}
            accessibilityLabel="Toggle Agent mode"
            disabled={phase !== 'idle'}
            hitSlop={6}
            style={[styles.agentChip, agentMode && styles.agentChipActive]}
            onPress={() => setAgentMode((v) => !v)}
          >
            <View style={styles.chipContent}>
              <Icon name="agent" size={16} tintColor={agentMode ? colors.bg : colors.textDim} />
              <Text style={[styles.agentChipText, agentMode && styles.agentChipTextActive]}>Agent</Text>
            </View>
          </Pressable>
          {agentMode && settings.allowWeb && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: phase !== 'idle', selected: deepResearch }}
              accessibilityLabel="Toggle research mode"
              disabled={phase !== 'idle'}
              hitSlop={6}
              style={[styles.agentChip, deepResearch && styles.researchChipActive]}
              onPress={() => setDeepResearch((v) => !v)}
            >
              <View style={styles.chipContent}>
                <Icon name="research" size={16} tintColor={deepResearch ? colors.bg : colors.textDim} />
                <Text style={[styles.agentChipText, deepResearch && styles.agentChipTextActive]}>Research</Text>
              </View>
            </Pressable>
          )}
        </View>
      </Animated.View>

      <FlatList
        ref={listRef}
        data={chat.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => <Bubble message={item} capabilities={attachmentCapabilities} />}
        ListEmptyComponent={
          phase === 'idle' ? (
            demoRequested ? (
              <LocalDemoCard onRun={() => send(LOCAL_DEMO_PROMPT)} />
            ) : (
              <View style={styles.chatEmpty}>
              <Text style={styles.chatEmptyText}>
                Ask anything — everything runs on your phone.
              </Text>
              </View>
            )
          ) : null
        }
        ListFooterComponent={
          <>
            {phase === 'loading-model' && (
              <Animated.View
                entering={FadeIn.duration(CHAT_MOTION.enter)}
                exiting={FadeOut.duration(CHAT_MOTION.exit)}
                layout={LinearTransition.duration(CHAT_MOTION.layout)}
              >
                <StatusRow text={`Loading ${resolveModel(chat.modelId)?.name ?? 'model'}…`} spinner />
              </Animated.View>
            )}
            {agentPlan && (
              <Animated.View
                entering={FadeInDown.duration(CHAT_MOTION.enter)}
                exiting={FadeOutUp.duration(CHAT_MOTION.exit)}
                layout={LinearTransition.duration(CHAT_MOTION.layout)}
                style={styles.planPanel}
              >
                <Text style={styles.planTitle}>Plan</Text>
                {agentPlan.steps.map((s) => (
                  <View key={s.id} style={styles.planRow}>
                    <Icon
                      name={s.done ? 'check' : 'observation'}
                      size={16}
                      tintColor={s.done ? colors.green : colors.textFaint}
                    />
                    <Text style={[styles.planText, s.done && styles.planTextDone]}>{s.text}</Text>
                  </View>
                ))}
              </Animated.View>
            )}
            {agentSteps.length > 0 && (
              <Animated.View
                entering={FadeIn.duration(CHAT_MOTION.enter)}
                exiting={FadeOut.duration(CHAT_MOTION.exit)}
                layout={LinearTransition.duration(CHAT_MOTION.layout)}
                style={styles.stepTimeline}
              >
                {agentSteps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </Animated.View>
            )}
            {phase === 'generating' && agentMode && (
              <Animated.View
                entering={FadeIn.duration(CHAT_MOTION.enter)}
                exiting={FadeOut.duration(CHAT_MOTION.exit)}
              >
                <StatusRow text={verifying ? 'Verifying answer…' : 'Agent working…'} spinner />
              </Animated.View>
            )}
            {phase === 'generating' && !agentMode && streamingParts && (
              <Animated.View
                entering={FadeInUp.duration(CHAT_MOTION.enter)}
                exiting={FadeOutUp.duration(CHAT_MOTION.exit)}
                layout={LinearTransition.duration(CHAT_MOTION.layout)}
                style={[styles.bubble, styles.assistantBubble]}
              >
                {streamingParts.isThinking && !streamingParts.answer ? (
                  <Text style={styles.thinkingText}>Thinking…</Text>
                ) : (
                  <Text style={styles.bubbleText}>{streamingParts.answer || ' '}</Text>
                )}
              </Animated.View>
            )}
            {phase === 'generating' && !agentMode && !streamingParts && (
              <Animated.View entering={FadeIn.duration(CHAT_MOTION.enter)} exiting={FadeOut.duration(CHAT_MOTION.exit)}>
                <StatusRow text="Preparing response" spinner />
              </Animated.View>
            )}
            {error && (
              <Animated.Text entering={FadeInDown.duration(CHAT_MOTION.enter)} exiting={FadeOut.duration(CHAT_MOTION.exit)} style={styles.errorText}>
                {error}
              </Animated.Text>
            )}
          </>
        }
      />

      <Animated.View
        layout={LinearTransition.duration(CHAT_MOTION.layout)}
        style={[styles.inputArea, { paddingBottom: spacing.md + (keyboardHeight > 0 ? keyboardHeight : insets.bottom) }]}
      >
        {pendingAttachment ? (
          <Animated.View
            entering={FadeInDown.duration(CHAT_MOTION.enter)}
            exiting={FadeOutUp.duration(CHAT_MOTION.exit)}
            layout={LinearTransition.duration(CHAT_MOTION.layout)}
          >
            <AttachmentChip
              attachment={pendingAttachment}
              capabilities={attachmentCapabilities}
              onClear={() => setPendingAttachment(null)}
            />
          </Animated.View>
        ) : null}
        <View style={styles.inputRow}>
          <IconButton
            accessibilityLabel="Open voice mode"
            accessibilityHint="Opens voice input without sending the current draft"
            disabled={phase !== 'idle'}
            onPress={() => navigation.navigate('Voice')}
            icon="mic"
            variant="secondary"
          />
          <AttachmentButton
            disabled={phase !== 'idle'}
            onPick={async () => {
              const att = await pickAttachment()
              if (att) setPendingAttachment(att)
            }}
          />
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor={colors.textFaint}
            value={input}
            onChangeText={setInput}
            multiline
            editable={phase !== 'generating'}
          />
          {composerAction({ phase, hasContent: Boolean(input.trim() || pendingAttachment) }) === 'stop' ? (
            <IconButton
              accessibilityLabel="Stop generating"
              accessibilityHint="Stops the current response and keeps the conversation"
              onPress={stop}
              icon="stop"
              variant="danger"
            />
          ) : (
            <IconButton
              accessibilityLabel="Send message"
              accessibilityHint="Sends the current message"
              disabled={composerAction({ phase, hasContent: Boolean(input.trim() || pendingAttachment) }) === 'disabled'}
              onPress={() => send()}
              icon="send"
              variant="primary"
            />
          )}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  )
}

function LocalDemoCard({ onRun }: { onRun: () => void }) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  return (
    <Animated.View entering={FadeInDown.duration(CHAT_MOTION.enter)} style={styles.localDemoCard}>
      <View style={styles.localDemoHeader}>
        <Icon name="check" size={18} tintColor={colors.green} />
        <Text style={styles.localDemoEyebrow}>Local-only demo</Text>
      </View>
      <Text style={styles.localDemoTitle}>See a real answer from your model</Text>
      <Text style={styles.localDemoPrompt}>{LOCAL_DEMO_PROMPT}</Text>
      <View style={styles.localDemoProof}>
        <Icon name="check" size={15} tintColor={colors.textDim} />
        <Text style={styles.localDemoProofText}>{LOCAL_DEMO_PROOF}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Run local demo"
        style={styles.primaryBtn}
        onPress={onRun}
      >
        <Text style={styles.primaryBtnText}>Run local demo</Text>
      </Pressable>
    </Animated.View>
  )
}

function Bubble({
  message,
  capabilities,
}: {
  message: ChatMessage
  capabilities?: AttachmentCapabilities
}) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const isUser = message.role === 'user'
  const verify = message.stats?.verify
  return (
    <Animated.View
      entering={FadeInUp.duration(CHAT_MOTION.enter)}
      layout={LinearTransition.duration(CHAT_MOTION.layout)}
      style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}
    >
      {message.attachment ? <AttachmentChip attachment={message.attachment} capabilities={capabilities} /> : null}
      {isUser ? (
        <Text selectable style={styles.bubbleText}>{message.content}</Text>
      ) : (
        <MarkdownText text={message.content} />
      )}
      {message.stats?.tokensPerSecond ? (
        <Text selectable style={styles.statsText}>
          {message.stats.tokensPerSecond.toFixed(1)} tok/s
          {message.stats.predictedTokens ? ` · ${message.stats.predictedTokens} tok` : ''}
        </Text>
      ) : null}
      {verify ? (
        <View style={styles.verifyRow}>
          <Icon
            name={verify.accept ? 'check' : 'warning'}
            size={14}
            tintColor={verify.accept ? colors.green : colors.yellow}
          />
          <Text selectable style={[styles.verifyBadge, { color: verify.accept ? colors.green : colors.yellow }]}>
            {verify.accept ? 'Verified' : 'Judge'} {verify.score}/10
            {verify.revised ? ' · revised' : ''}
          </Text>
        </View>
      ) : null}
    </Animated.View>
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
  const icon: IconName =
    step.kind === 'thought'
      ? 'thought'
      : step.kind === 'tool_call'
        ? 'tool'
        : step.kind === 'observation'
          ? 'observation'
          : step.kind === 'error'
            ? 'warning'
            : step.kind === 'subtask'
              ? 'subtask'
              : 'check'
  const label =
    step.kind === 'tool_call'
      ? `${step.tool} ${step.content}`
      : step.content
  if (step.kind === 'final' || step.kind === 'plan_check') return null // shown elsewhere
  return (
    <View style={styles.stepRow}>
      <Icon name={icon} size={15} tintColor={step.kind === 'error' ? colors.red : colors.textDim} />
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
    borderCurve: 'continuous',
  },
  primaryBtnText: { color: colors.accentText, fontWeight: '700', fontSize: 16 },
  modelToolbar: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  agentChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  agentChipActive: { backgroundColor: colors.green, borderColor: colors.green },
  researchChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  agentChipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  agentChipTextActive: { color: colors.bg },
  chipContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepTimeline: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  stepRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepText: { color: colors.textDim, fontSize: 12, flex: 1, lineHeight: 17 },
  planPanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderCurve: 'continuous',
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
  planText: { color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
  planTextDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  localDemoCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.green,
    borderCurve: 'continuous',
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  localDemoHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  localDemoEyebrow: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  localDemoTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  localDemoPrompt: {
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 14,
    lineHeight: 20,
  },
  localDemoProof: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  localDemoProofText: { color: colors.textDim, flex: 1, fontSize: 12, lineHeight: 17 },
  chatEmpty: { alignItems: 'center', paddingTop: 120, paddingHorizontal: spacing.xl },
  chatEmptyText: { color: colors.textFaint, fontSize: 14, textAlign: 'center' },
  bubble: {
    maxWidth: '88%',
    borderRadius: radius.lg,
    borderCurve: 'continuous',
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
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  verifyBadge: { fontSize: 11, fontWeight: '700' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  statusText: { color: colors.textDim, fontSize: 13 },
  errorText: { color: colors.red, fontSize: 13, padding: spacing.sm },
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    minHeight: CHAT_TOUCH_TARGET,
  },
  input: {
    flex: 1,
    minHeight: COMPOSER_MIN_HEIGHT,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    borderCurve: 'continuous',
  },
})
)
