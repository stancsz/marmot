import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { InferenceSettings } from '../types'
import { DEFAULT_SETTINGS, loadChats, loadSettings, saveSettings } from '../lib/chatStore'
import type { RootStackParamList } from '../navigation'
import { shareAllChatsAsJson } from '../lib/exportShare'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { ThemeMode, useTheme } from '../ThemeContext'

const CONTEXT_OPTIONS = [2048, 4096, 8192]

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { colors, mode, setMode } = useTheme()
  const styles = getStyles(colors)
  const [settings, setSettings] = useState<InferenceSettings | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<InferenceSettings | null>(null)

  useEffect(() => {
    loadSettings().then(setSettings)
    return () => {
      // flush any debounced change on unmount so nothing is lost
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (pending.current) saveSettings(pending.current)
    }
  }, [])

  const update = (patch: Partial<InferenceSettings>) => {
    if (!settings) return
    const next = { ...settings, ...patch }
    setSettings(next)
    // debounce disk writes — typing in the system prompt fires per keystroke
    pending.current = next
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      pending.current = null
      saveSettings(next)
    }, 400)
  }

  if (!settings) return <View style={styles.container} />

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.rowLabel}>Appearance</Text>
      <Text style={styles.rowHint}>Dark, light, or follow your device setting.</Text>
      <View style={styles.segmentRow}>
        {(
          [
            { key: 'system', label: 'System' },
            { key: 'dark', label: 'Dark' },
            { key: 'light', label: 'Light' },
          ] as { key: ThemeMode; label: string }[]
        ).map(({ key, label }) => {
          const active = mode === key
          return (
            <Pressable
              key={key}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setMode(key)}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Stepper
        label="Temperature"
        hint="Higher = more creative, lower = more focused"
        value={settings.temperature}
        display={settings.temperature.toFixed(2)}
        onChange={(v) => update({ temperature: clamp(round2(v), 0, 2) })}
        step={0.05}
      />
      <Stepper
        label="Top P"
        hint="Nucleus sampling cutoff"
        value={settings.topP}
        display={settings.topP.toFixed(2)}
        onChange={(v) => update({ topP: clamp(round2(v), 0.05, 1) })}
        step={0.05}
      />
      <Stepper
        label="Max response tokens"
        hint="Longest reply the model may generate"
        value={settings.maxTokens}
        display={String(settings.maxTokens)}
        onChange={(v) => update({ maxTokens: clamp(v, 128, 4096) })}
        step={128}
      />

      <Text style={styles.rowLabel}>Context length</Text>
      <Text style={styles.rowHint}>
        Larger context remembers longer conversations but uses more memory.
        Changing this reloads the model.
      </Text>
      <View style={styles.segmentRow}>
        {CONTEXT_OPTIONS.map((n) => {
          const active = settings.contextLength === n
          return (
            <Pressable
              key={n}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => update({ contextLength: n })}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {n}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.rowLabel}>System prompt</Text>
      <TextInput
        style={styles.systemInput}
        multiline
        value={settings.systemPrompt}
        onChangeText={(t) => update({ systemPrompt: t })}
        placeholder="How should the assistant behave?"
        placeholderTextColor={colors.textFaint}
      />

      <Pressable style={styles.resetBtn} onPress={() => update(DEFAULT_SETTINGS)}>
        <Text style={styles.resetText}>Reset to defaults</Text>
      </Pressable>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Verify answers</Text>
          <Text style={styles.rowHint}>
            After each Agent Mode reply, the model critiques its own answer
            and an independent judge pass scores it. Slower, more reliable.
          </Text>
        </View>
        <Switch
          value={settings.verifyAnswers}
          onValueChange={(v) => update({ verifyAnswers: v })}
          trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
          thumbColor={colors.surface}
        />
      </View>

      <Text style={styles.rowLabel}>Agent memory</Text>
      <Text style={styles.rowHint}>
        What the agent remembers about you and your projects — view, add, or
        delete entries.
      </Text>
      <Pressable style={styles.exportBtn} onPress={() => navigation.navigate('Memory')}>
        <Text style={styles.exportText}>Manage memory</Text>
      </Pressable>

      <Text style={styles.rowLabel}>Your data</Text>
      <Text style={styles.rowHint}>
        Backs up every conversation as a JSON file via the share sheet — save
        it to Google Drive, OneDrive, Files, or anywhere else you like.
      </Text>
      <Pressable
        style={styles.exportBtn}
        onPress={async () => {
          const chats = await loadChats()
          if (chats.length === 0) {
            Alert.alert('Nothing to export', 'You have no chats yet.')
            return
          }
          shareAllChatsAsJson(chats).catch((e) => Alert.alert('Export failed', e.message))
        }}
      >
        <Text style={styles.exportText}>Export all chats</Text>
      </Pressable>
    </ScrollView>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}
function round2(v: number) {
  return Math.round(v * 100) / 100
}

function Stepper({
  label,
  hint,
  value,
  display,
  onChange,
  step,
}: {
  label: string
  hint: string
  value: number
  display: string
  onChange: (v: number) => void
  step: number
}) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  return (
    <View style={styles.stepperRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <View style={styles.stepperControls}>
        <Pressable style={styles.stepBtn} hitSlop={8} onPress={() => onChange(value - step)}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{display}</Text>
        <Pressable style={styles.stepBtn} hitSlop={8} onPress={() => onChange(value + step)}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowHint: { color: colors.textFaint, fontSize: 12, marginTop: 2, marginBottom: spacing.sm },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.text, fontSize: 18, fontWeight: '700' },
  stepValue: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  segmentRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { color: colors.textDim, fontWeight: '600', fontSize: 14 },
  segmentTextActive: { color: colors.accentText },
  systemInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.lg,
    minHeight: 100,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: spacing.xl,
  },
  exportBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: 40,
  },
  exportText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  resetBtn: { alignItems: 'center', padding: spacing.md, marginBottom: spacing.xl },
  resetText: { color: colors.red, fontSize: 14, fontWeight: '600' },
})
)
