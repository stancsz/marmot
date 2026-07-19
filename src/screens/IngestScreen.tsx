import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as Clipboard from 'expo-clipboard'
import { engine } from '../lib/engine'
import { downloads } from '../lib/downloads'
import { agentDocuments } from '../lib/agentRuntime'
import { loadSettings } from '../lib/chatStore'
import { TEXT_ACTIONS, TextAction } from '../lib/textActions'
import { splitThinking, visibleAnswer } from '../lib/thinking'
import MarkdownText from '../components/MarkdownText'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import type { RootStackParamList } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'Ingest'>

export default function IngestScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [text, setText] = useState(route.params?.text ?? '')

  // a share/deep-link can arrive while this screen is already open — adopt
  // the new text instead of silently keeping the old one (found in E2E)
  useEffect(() => {
    if (route.params?.text) setText(route.params.text)
  }, [route.params?.text])
  const [activeAction, setActiveAction] = useState<TextAction | null>(null)
  const [pendingOptions, setPendingOptions] = useState<TextAction | null>(null)
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [thinkingLive, setThinkingLive] = useState(false)

  const run = useCallback(
    async (action: TextAction, option?: string) => {
      const input = text.trim()
      if (!input) return
      setPendingOptions(null)
      setActiveAction(action)
      setResult('')
      setBusy(true)
      try {
        const settings = await loadSettings()
        await downloads.init()
        const modelId = engine.getLoadedModelId() ?? downloads.downloadedModelIds()[0]
        if (!modelId) {
          Alert.alert('No model', 'Download a model in the library first.')
          return
        }
        await engine.ensureLoaded(modelId, settings.contextLength, {
          gpuAndroid: settings.gpuAndroid,
        })
        // stream the answer as it generates; reasoning models think first,
        // so surface a "Thinking…" state instead of a silent spinner
        let acc = ''
        const completion = await engine.complete(
          [{ role: 'user', content: action.buildPrompt(input, option) }],
          settings,
          (token) => {
            acc += token
            const parts = splitThinking(acc)
            setThinkingLive(parts.isThinking)
            if (parts.answer) setResult(parts.answer)
          },
          { enableThinking: false } // quick actions are transforms, not puzzles
        )
        setResult(visibleAnswer(completion.text))
      } catch (e: any) {
        Alert.alert('Action failed', e?.message ?? 'Generation failed')
      } finally {
        setBusy(false)
        setThinkingLive(false)
      }
    },
    [text]
  )

  const saveToDocuments = useCallback(async () => {
    const input = text.trim()
    if (!input) return
    try {
      const title = `Shared ${new Date().toLocaleString()}`
      const doc = await agentDocuments.addDocument(title, input)
      Alert.alert('Saved', `"${doc.name}" — ${doc.chunkCount} searchable passages.`)
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? '')
    }
  }, [text])

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <TextInput
        style={styles.input}
        multiline
        value={text}
        onChangeText={setText}
        placeholder="Paste or share text here — an article, an email, anything."
        placeholderTextColor={colors.textFaint}
      />

      {/* action chips */}
      <View style={styles.chipRow}>
        {TEXT_ACTIONS.map((action) => (
          <Pressable
            key={action.id}
            disabled={busy || !text.trim()}
            style={[
              styles.chip,
              activeAction?.id === action.id && styles.chipActive,
              (!text.trim() || busy) && { opacity: 0.45 },
            ]}
            onPress={() => (action.options ? setPendingOptions(action) : run(action))}
          >
            <Text style={[styles.chipText, activeAction?.id === action.id && styles.chipTextActive]}>
              {action.emoji} {action.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          disabled={!text.trim()}
          style={[styles.chip, !text.trim() && { opacity: 0.45 }]}
          onPress={saveToDocuments}
        >
          <Text style={styles.chipText}>📚 Save to documents</Text>
        </Pressable>
      </View>

      {/* option sub-chips (translate targets, tones) */}
      {pendingOptions && (
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>{pendingOptions.label}:</Text>
          {pendingOptions.options!.map((option) => (
            <Pressable key={option} style={styles.optionChip} onPress={() => run(pendingOptions, option)}>
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.busyText}>
            {thinkingLive ? 'Thinking…' : `${activeAction?.label}…`}
          </Text>
        </View>
      )}

      {result !== '' && (
        <View style={styles.resultCard}>
          <MarkdownText text={result} />
          <View style={styles.resultActions}>
            <Pressable
              style={styles.resultBtn}
              onPress={() => Clipboard.setStringAsync(result).then(() => Alert.alert('Copied'))}
            >
              <Text style={styles.resultBtnText}>Copy</Text>
            </Pressable>
            <Pressable style={styles.resultBtn} onPress={() => setText(result)}>
              <Text style={styles.resultBtnText}>Use as input</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      color: colors.text,
      padding: spacing.lg,
      minHeight: 130,
      maxHeight: 260,
      fontSize: 15,
      lineHeight: 21,
      textAlignVertical: 'top',
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.text, fontSize: 13.5, fontWeight: '600' },
    chipTextActive: { color: colors.accentText },
    optionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    optionLabel: { color: colors.textDim, fontSize: 13 },
    optionChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionText: { color: colors.text, fontSize: 13 },
    busyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
    busyText: { color: colors.textDim, fontSize: 14 },
    resultCard: {
      marginTop: spacing.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
    },
    resultActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    resultBtn: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resultBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  })
)
