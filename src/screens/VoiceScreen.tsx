import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Speech from 'expo-speech'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import { engine } from '../lib/engine'
import { downloads } from '../lib/downloads'
import { agentDocuments, agentMemory } from '../lib/agentRuntime'
import { loadSettings } from '../lib/chatStore'
import { episodicSummary, LLMMessage } from '../agent'
import { VoicePhase, VoiceSession, detectAddress } from '../lib/voiceSession'
import { visibleAnswer } from '../lib/thinking'
import { InferenceSettings } from '../types'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import Icon from '../components/Icon'

type Mode = 'conversation' | 'meeting'

interface Suggestion {
  request: string
  reply: string
}

interface Turn {
  role: 'user' | 'assistant'
  text: string
}

const BAR_COUNT = 7
const BAR_PEAKS = [0.55, 0.85, 0.65, 1.0, 0.7, 0.9, 0.6]

function speakAsync(text: string): Promise<void> {
  return new Promise((resolve) => {
    Speech.speak(text, { onDone: resolve, onStopped: resolve, onError: () => resolve() })
  })
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function VoiceScreen() {
  const { colors, resolved } = useTheme()
  const styles = getStyles(colors)
  const [mode, setMode] = useState<Mode>('conversation')
  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [partial, setPartial] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [transcript, setTranscript] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [elapsed, setElapsed] = useState(0)
  const settingsRef = useRef<InferenceSettings | null>(null)
  const sessionRef = useRef<VoiceSession | null>(null)
  const activeRef = useRef(false)
  const modeRef = useRef<Mode>('conversation')
  const historyRef = useRef<LLMMessage[]>([])
  activeRef.current = active
  modeRef.current = mode

  // --- animations ---
  const orbScale = useRef(new Animated.Value(1)).current
  const ringOpacity = useRef(new Animated.Value(0.35)).current
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.25))
  ).current

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = []
    if (active && phase === 'listening') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.07, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 1.0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      )
      pulse.start()
      loops.push(pulse)
    } else {
      orbScale.setValue(1)
    }

    if (active && phase === 'thinking') {
      const breathe = Animated.loop(
        Animated.sequence([
          Animated.timing(ringOpacity, { toValue: 0.85, duration: 600, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.25, duration: 600, useNativeDriver: true }),
        ])
      )
      breathe.start()
      loops.push(breathe)
    } else {
      ringOpacity.setValue(0.35)
    }

    if (active && (phase === 'listening' || phase === 'speaking')) {
      bars.forEach((bar, i) => {
        const wave = Animated.loop(
          Animated.sequence([
            Animated.delay(i * 90),
            Animated.timing(bar, { toValue: BAR_PEAKS[i], duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            Animated.timing(bar, { toValue: 0.3, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
          ])
        )
        wave.start()
        loops.push(wave)
      })
    } else {
      bars.forEach((bar) => bar.setValue(0.25))
    }
    return () => loops.forEach((l) => l.stop())
  }, [active, phase, orbScale, ringOpacity, bars])

  // meeting elapsed timer
  useEffect(() => {
    if (!active || mode !== 'meeting') return
    setElapsed(0)
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(timer)
  }, [active, mode])

  useEffect(() => {
    loadSettings().then((s) => (settingsRef.current = s))
    return () => {
      ExpoSpeechRecognitionModule.stop()
      Speech.stop()
    }
  }, [])

  const llmReply = useCallback(async (text: string): Promise<string> => {
    const settings = settingsRef.current
    if (!settings) throw new Error('settings not loaded')
    historyRef.current.push({ role: 'user', content: text })
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          `${settings.systemPrompt}\n` +
          'You are in live voice mode: answer in 1-3 short spoken-style sentences.',
      },
      ...historyRef.current.slice(-8),
    ]
    const result = await engine.complete(
      messages,
      { ...settings, maxTokens: Math.min(200, settings.maxTokens) },
      () => {},
      { enableThinking: false } // spoken replies must come fast and direct
    )
    // never speak think-blocks aloud
    const spoken = visibleAnswer(result.text)
    historyRef.current.push({ role: 'assistant', content: spoken })
    return spoken
  }, [])

  const startRecognition = useCallback(() => {
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: modeRef.current === 'meeting',
    })
  }, [])

  // v1: pause the mic while thinking/speaking (no echo cancellation claims)
  const onPhaseChange = useCallback(
    (next: VoicePhase) => {
      setPhase(next)
      if (next === 'listening' && activeRef.current) startRecognition()
      if (next === 'thinking' || next === 'speaking') ExpoSpeechRecognitionModule.stop()
    },
    [startRecognition]
  )

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript ?? ''
    if (!event.isFinal) {
      setPartial(text)
      return
    }
    setPartial('')
    if (!activeRef.current || !text.trim()) return
    if (modeRef.current === 'conversation') {
      setTurns((prev) => [...prev.slice(-4), { role: 'user', text: text.trim() }])
      sessionRef.current?.handleFinalTranscript(text)
    } else {
      const stamped = `[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${text.trim()}`
      setTranscript((prev) => [...prev, stamped])
      const address = detectAddress(text)
      if (address.addressed && address.request) {
        const context = transcript.slice(-12).join('\n')
        llmReply(
          `You are assisting in a live meeting. Recent transcript:\n${context}\n\nSomeone asked you: ${address.request}\nReply in 1-2 spoken sentences.`
        )
          .then((reply) =>
            setSuggestions((prev) => [...prev, { request: address.request, reply: reply.trim() }])
          )
          .catch(() => {})
      }
    }
  })

  useSpeechRecognitionEvent('end', () => {
    if (activeRef.current && modeRef.current === 'meeting') startRecognition()
  })

  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'not-allowed') {
      setActive(false)
      sessionRef.current?.stop()
      Alert.alert('Microphone needed', 'Enable microphone and speech recognition permissions.')
    } else if (activeRef.current && modeRef.current === 'meeting') {
      startRecognition()
    }
  })

  const start = useCallback(async () => {
    await downloads.init()
    if (downloads.downloadedModelIds().length === 0 && !engine.getLoadedModelId()) {
      Alert.alert('No model', 'Download a model in the library first.')
      return
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Microphone needed', 'Marmot needs the microphone for voice mode.')
      return
    }
    const settings = settingsRef.current
    const modelId = engine.getLoadedModelId() ?? downloads.downloadedModelIds()[0]
    if (settings && modelId) {
      await engine.ensureLoaded(modelId, settings.contextLength, { gpuAndroid: settings.gpuAndroid })
    }
    historyRef.current = []
    setActive(true)
    activeRef.current = true
    if (modeRef.current === 'conversation') {
      sessionRef.current = new VoiceSession(llmReply, speakAsync, {
        onPhase: onPhaseChange,
        onReply: (text) => setTurns((prev) => [...prev.slice(-4), { role: 'assistant', text }]),
      })
      sessionRef.current.start()
    } else {
      setPhase('listening')
      startRecognition()
    }
  }, [llmReply, onPhaseChange, startRecognition])

  const stop = useCallback(async () => {
    setActive(false)
    activeRef.current = false
    sessionRef.current?.stop()
    ExpoSpeechRecognitionModule.stop()
    Speech.stop()
    setPhase('idle')
    if (modeRef.current === 'meeting' && transcript.length > 0) {
      const name = `Meeting ${new Date().toLocaleString()}`
      const body = transcript.join('\n')
      try {
        await agentDocuments.addDocument(name, body)
        await agentMemory.add('episodic', episodicSummary(`Meeting transcribed: ${name}`, body))
        Alert.alert('Saved', `Transcript stored as "${name}" — searchable by the agent.`)
      } catch (e: any) {
        Alert.alert('Could not save transcript', e?.message ?? '')
      }
    }
  }, [transcript])

  const phaseColor =
    phase === 'listening' ? colors.green : phase === 'idle' ? colors.border : colors.accent
  const statusText =
    phase === 'listening'
      ? partial || 'Listening'
      : phase === 'thinking'
        ? 'Thinking'
        : phase === 'speaking'
          ? 'Speaking'
          : mode === 'conversation'
            ? 'Tap to talk'
            : 'Tap to record'

  const lastTurns = turns.slice(-3)

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={
          resolved === 'light'
            ? [colors.bg, colors.surfaceAlt, colors.bg]
            : ['#0A0E14', '#101826', '#0A0E14']
        }
        style={StyleSheet.absoluteFill}
      />

      {/* floating mode control */}
      <View style={styles.segmentWrap}>
        <View style={styles.segment}>
          {(['conversation', 'meeting'] as Mode[]).map((m) => (
            <Pressable
              key={m}
              disabled={active}
              style={[styles.segmentItem, mode === m && styles.segmentItemActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                {m === 'conversation' ? 'Conversation' : 'Meeting'}
              </Text>
            </Pressable>
          ))}
        </View>
        {active && mode === 'meeting' && (
          <View style={styles.recPill}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{formatElapsed(elapsed)}</Text>
          </View>
        )}
      </View>

      {/* content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {mode === 'conversation' &&
          (lastTurns.length === 0 ? (
            <Text style={styles.emptyPrompt}>
              A live, spoken conversation with the model on your phone.{'\n'}Nothing leaves the
              device.
            </Text>
          ) : (
            lastTurns.map((t, i) => (
              <View key={i} style={[styles.turnBlock, { opacity: 0.45 + (0.55 * (i + 1)) / lastTurns.length }]}>
                <Text style={[styles.turnLabel, t.role === 'assistant' && { color: colors.accent }]}>
                  {t.role === 'user' ? 'YOU' : 'MARMOT'}
                </Text>
                <Text style={[styles.turnText, t.role === 'assistant' && styles.assistantText]}>
                  {t.text}
                </Text>
              </View>
            ))
          ))}

        {mode === 'meeting' && (
          <>
            {transcript.length === 0 ? (
              <Text style={styles.emptyPrompt}>
                Transcribes the room continuously.{'\n'}Say “Marmot, …” for a suggested
                contribution.{'\n'}The transcript becomes searchable when you stop.
              </Text>
            ) : (
              <View style={styles.transcriptCard}>
                {transcript.slice(-14).map((line, i) => (
                  <Text key={i} style={styles.transcriptLine}>
                    {line}
                  </Text>
                ))}
              </View>
            )}
            {suggestions.map((s, i) => (
              <View key={`s${i}`} style={styles.suggestionCard}>
                <Text style={styles.suggestionLabel}>SUGGESTION · “{s.request}”</Text>
                <Text style={styles.suggestionText}>{s.reply}</Text>
                <Pressable style={styles.speakBtn} onPress={() => Speech.speak(s.reply)}>
                  <Text style={styles.speakBtnText}>Speak it</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* stage: waveform + orb + status */}
      <View style={styles.stage}>
        <View style={styles.waveRow}>
          {bars.map((bar, i) => (
            <Animated.View
              key={i}
              style={[
                styles.waveBar,
                {
                  backgroundColor: phase === 'idle' ? colors.border : phaseColor,
                  height: bar.interpolate({ inputRange: [0, 1], outputRange: [4, 34] }),
                },
              ]}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={active ? 'Stop voice mode' : 'Start voice mode'}
          onPress={active ? stop : start}
        >
          <View style={styles.orbArea}>
            <Animated.View
              style={[styles.glowOuter, { borderColor: phaseColor, opacity: ringOpacity }]}
            />
            <View style={[styles.glowMid, { borderColor: phaseColor }]} />
            <Animated.View
              style={[
                styles.orb,
                { transform: [{ scale: orbScale }], borderColor: phaseColor },
              ]}
            >
              <Icon name={active ? 'stop' : 'mic'} size={32} tintColor={colors.text} weight="semibold" />
            </Animated.View>
          </View>
        </Pressable>

        <Text style={styles.statusText} numberOfLines={1}>
          {statusText}
        </Text>
        {active && (
          <Pressable style={styles.endPill} onPress={stop}>
            <Text style={styles.endPillText}>End {mode === 'meeting' ? '& save' : ''}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    segmentWrap: { alignItems: 'center', paddingTop: spacing.lg, gap: spacing.sm },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
    },
    segmentItem: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
    },
    segmentItemActive: { backgroundColor: colors.accent },
    segmentText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
    segmentTextActive: { color: colors.accentText },
    recPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
    recText: { color: colors.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
    content: { padding: spacing.xl, paddingBottom: spacing.lg, flexGrow: 1, justifyContent: 'center' },
    emptyPrompt: {
      color: colors.textFaint,
      fontSize: 15,
      lineHeight: 24,
      textAlign: 'center',
    },
    turnBlock: { marginBottom: spacing.lg },
    turnLabel: {
      color: colors.textFaint,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.5,
      marginBottom: 4,
    },
    turnText: { color: colors.textDim, fontSize: 16, lineHeight: 24 },
    assistantText: { color: colors.text, fontSize: 18, lineHeight: 27 },
    transcriptCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
    },
    transcriptLine: { color: colors.textDim, fontSize: 13, lineHeight: 21 },
    suggestionCard: {
      backgroundColor: colors.surface,
      borderLeftWidth: 3,
      borderLeftColor: colors.green,
      borderRadius: radius.sm,
      padding: spacing.md,
      marginTop: spacing.md,
      gap: spacing.xs,
    },
    suggestionLabel: { color: colors.green, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    suggestionText: { color: colors.text, fontSize: 14, lineHeight: 21 },
    speakBtn: {
      alignSelf: 'flex-start',
      backgroundColor: colors.green,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
      marginTop: spacing.xs,
    },
    speakBtnText: { color: colors.bg, fontSize: 12, fontWeight: '700' },
    stage: { alignItems: 'center', paddingBottom: spacing.xl * 1.5, gap: spacing.md },
    waveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 36,
    },
    waveBar: { width: 4, borderRadius: 2 },
    orbArea: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center' },
    glowOuter: {
      position: 'absolute',
      width: 168,
      height: 168,
      borderRadius: 84,
      borderWidth: 1,
    },
    glowMid: {
      position: 'absolute',
      width: 140,
      height: 140,
      borderRadius: 70,
      borderWidth: 1,
      opacity: 0.5,
    },
    orb: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: colors.surface,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    statusText: { color: colors.textDim, fontSize: 15, maxWidth: 280 },
    endPill: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.red,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm,
    },
    endPillText: { color: colors.red, fontSize: 13, fontWeight: '700' },
  })
)
