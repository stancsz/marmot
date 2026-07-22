import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { engine } from '../lib/engine'
import { downloads } from '../lib/downloads'
import { loadCustomModels, customModelsCache, resolveModel } from '../lib/customModels'
import { loadSettings } from '../lib/chatStore'
import {
  buildFlightPrompt,
  FLIGHT_ACTIVITIES,
  FLIGHT_SYSTEM_PROMPT,
  FlightActivity,
} from '../lib/flightMode'
import { splitThinking, visibleAnswer } from '../lib/thinking'
import MarkdownText from '../components/MarkdownText'
import Icon from '../components/Icon'
import type { RootStackParamList } from '../navigation'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'

type Nav = NativeStackNavigationProp<RootStackParamList>

/**
 * A user-invoked, bounded offline activity surface. It intentionally does
 * not subscribe to AppState, notifications, location, or a background loop.
 */
export default function FlightModeScreen() {
  const navigation = useNavigation<Nav>()
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [activity, setActivity] = useState<FlightActivity>(FLIGHT_ACTIVITIES[0])
  const [context, setContext] = useState('')
  const [answer, setAnswer] = useState('')
  const [thinking, setThinking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [modelName, setModelName] = useState('Checking local models…')
  const [modelReady, setModelReady] = useState(false)
  const [status, setStatus] = useState('Activity pauses when you leave this screen.')
  const cancelRef = useRef(false)
  const busyRef = useRef(false)

  useEffect(() => {
    let mounted = true
    const hydrate = async () => {
      await Promise.all([downloads.init(), loadCustomModels()])
      if (!mounted) return
      const modelId = preferredFlightModelId()
      const model = resolveModel(modelId)
      setModelName(model?.name ?? (modelId ? 'Local model ready' : 'No local model downloaded'))
      setModelReady(Boolean(modelId))
    }
    hydrate().catch(() => {
      if (mounted) setModelName('No local model downloaded')
    })
    return () => {
      mounted = false
      if (busyRef.current) engine.stop().catch(() => {})
    }
  }, [])

  const run = useCallback(async () => {
    if (busy) return
    cancelRef.current = false
    setAnswer('')
    setBusy(true)
    busyRef.current = true
    setStatus('Running locally on this phone…')
    try {
      const settings = await loadSettings()
      await downloads.init()
      await loadCustomModels()
      const modelId = preferredFlightModelId()
      if (!modelId) {
        setModelReady(false)
        setModelName('No local model downloaded')
        setStatus('Download a small model in Model library to start Flight mode.')
        return
      }
      const model = resolveModel(modelId)
      setModelName(model?.name ?? 'Local model ready')
      setModelReady(true)
      const flightSettings = {
        ...settings,
        allowWeb: false,
        contextLength: Math.min(settings.contextLength, 2048),
        maxTokens: Math.min(settings.maxTokens, 128),
      }
      await engine.ensureLoaded(modelId, flightSettings.contextLength, {
        gpuAndroid: settings.gpuAndroid,
      })
      let streamed = ''
      const completion = await engine.complete(
        [
          { role: 'system', content: FLIGHT_SYSTEM_PROMPT },
          { role: 'user', content: buildFlightPrompt(activity.id, context) },
        ],
        flightSettings,
        (token) => {
          streamed += token
          const parts = splitThinking(streamed)
          setThinking(parts.isThinking)
          if (parts.answer) setAnswer(parts.answer)
        },
        { enableThinking: false }
      )
      if (cancelRef.current) {
        setStatus('Stopped. Nothing was saved.')
      } else {
        setAnswer(visibleAnswer(completion.text))
        setStatus('Generated locally · nothing was sent or saved')
      }
    } catch (error: any) {
      if (!cancelRef.current) setStatus(error?.message ?? 'Local activity failed.')
    } finally {
      setThinking(false)
      setBusy(false)
      busyRef.current = false
    }
  }, [activity.id, busy, context])

  const stop = useCallback(async () => {
    cancelRef.current = true
    await engine.stop()
    setStatus('Stopped. Nothing was saved.')
    setBusy(false)
    busyRef.current = false
  }, [])

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero} accessible accessibilityLabel="Offline companion">
        <View style={styles.heroIcon}>
          <Icon name="flight" size={22} tintColor={colors.accentText} weight="semibold" />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Offline companion</Text>
          <Text style={styles.heroText}>Small, private activities for a quiet flight.</Text>
        </View>
        <View style={styles.readyPill}>
          <Icon name="check" size={14} tintColor={colors.green} weight="semibold" />
          <Text style={styles.readyText}>Local</Text>
        </View>
      </View>

      <View style={styles.contract}>
        <Icon name="privacy" size={17} tintColor={colors.textDim} />
        <Text style={styles.contractText}>
          No network, no location, no notifications. Nothing runs in the background.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Choose an activity</Text>
      <View style={styles.activityGrid}>
        {FLIGHT_ACTIVITIES.map((item) => {
          const selected = item.id === activity.id
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected, disabled: busy }}
              disabled={busy}
              onPress={() => {
                setActivity(item)
                setAnswer('')
                setStatus('Activity pauses when you leave this screen.')
              }}
              style={[styles.activityCard, selected && styles.activityCardSelected, busy && styles.disabled]}
            >
              <Icon name={item.icon} size={19} tintColor={selected ? colors.text : colors.textDim} weight="semibold" />
              <Text style={styles.activityLabel}>{item.label}</Text>
              <Text style={styles.activityDescription} numberOfLines={2}>{item.description}</Text>
            </Pressable>
          )
        })}
      </View>

      <TextInput
        accessibilityLabel="Optional flight activity context"
        multiline
        maxLength={280}
        value={context}
        onChangeText={setContext}
        placeholder="Optional destination, language, or mood"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
      />

      <View style={styles.actionRow}>
        <View style={styles.modelStatus}>
          <Icon name="models" size={16} tintColor={colors.textDim} />
          <Text style={styles.modelText} numberOfLines={1}>{modelName}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Stop activity' : 'Start activity'}
          disabled={!modelReady && !busy}
          onPress={busy ? stop : run}
          style={[styles.startButton, !modelReady && !busy && styles.startButtonDisabled]}
        >
          {busy ? <ActivityIndicator color={colors.accentText} size="small" /> : <Icon name="subtask" size={17} tintColor={colors.accentText} weight="semibold" />}
          <Text style={styles.startButtonText}>{busy ? 'Stop' : 'Start activity'}</Text>
        </Pressable>
      </View>

      {!modelReady && !busy ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open model library" onPress={() => navigation.navigate('Models')} style={styles.modelHelp}>
          <Text style={styles.modelHelpText}>Download a small local model in Model library</Text>
          <Icon name="chevronDown" size={16} tintColor={colors.textDim} />
        </Pressable>
      ) : null}

      {busy ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.statusText}>{thinking ? 'Thinking locally…' : status}</Text>
        </View>
      ) : null}

      {answer ? (
        <View style={styles.answerCard} accessible accessibilityRole="summary">
          <View style={styles.answerHeader}>
            <Icon name="companion" size={18} tintColor={colors.accent} weight="semibold" />
            <Text style={styles.answerTitle}>{activity.label}</Text>
          </View>
          <MarkdownText text={answer} />
        </View>
      ) : null}

      {!busy ? <Text style={styles.statusText}>{status}</Text> : null}
    </ScrollView>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: 56, gap: spacing.md },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroIcon: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.accent,
    },
    heroCopy: { flex: 1, gap: 3 },
    heroTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
    heroText: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
    readyPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    readyText: { color: colors.green, fontSize: 12, fontWeight: '700' },
    contract: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    contractText: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 17 },
    sectionLabel: {
      marginTop: spacing.sm,
      color: colors.textFaint,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    activityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    activityCard: {
      width: '48%',
      minHeight: 104,
      padding: spacing.md,
      gap: spacing.xs,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    activityCardSelected: { borderColor: colors.text, backgroundColor: colors.surfaceAlt },
    activityLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
    activityDescription: { color: colors.textDim, fontSize: 12, lineHeight: 16 },
    disabled: { opacity: 0.55 },
    input: {
      minHeight: 72,
      maxHeight: 120,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 14,
      textAlignVertical: 'top',
    },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    modelStatus: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    modelText: { flex: 1, color: colors.textDim, fontSize: 12 },
    startButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
    },
    startButtonDisabled: { opacity: 0.45 },
    startButtonText: { color: colors.accentText, fontSize: 14, fontWeight: '700' },
    modelHelp: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
    modelHelpText: { color: colors.textDim, fontSize: 13 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    statusText: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
    answerCard: { padding: spacing.lg, gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    answerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    answerTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  })
)

function preferredFlightModelId(): string | null {
  const loadedId = engine.getLoadedModelId()
  const downloadedTextModel = downloads
    .downloadedModelIds()
    .find((id) => !resolveModel(id)?.projector)
  if (downloadedTextModel) return downloadedTextModel
  const loadedIsVision = engine.getLoadedModalities().vision
  return loadedId && !loadedIsVision ? loadedId : loadedId ?? customModelsCache()[0]?.id ?? null
}
