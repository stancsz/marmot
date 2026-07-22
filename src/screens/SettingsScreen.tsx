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
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { InferenceSettings } from '../types'
import { DEFAULT_SETTINGS, loadChats, loadSettings, saveAllChats, saveSettings } from '../lib/chatStore'
import { mergeChats, parseChatExport } from '../lib/importParse'
import { Persona } from '../lib/personaCore'
import { loadPersonas, removeCustomPersona, saveCustomPersona } from '../lib/personas'
import {
  McpServerEntry,
  addMcpServer,
  loadMcpServers,
  removeMcpServer,
  setMcpServerEnabled,
} from '../lib/mcpServers'
import type { RootStackParamList } from '../navigation'
import { shareAllChatsAsJson } from '../lib/exportShare'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { ThemeMode, useTheme } from '../ThemeContext'
import SelectMenu from '../components/SelectMenu'

const CONTEXT_OPTIONS = [2048, 4096, 8192]

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { colors, mode, setMode } = useTheme()
  const styles = getStyles(colors)
  const [settings, setSettings] = useState<InferenceSettings | null>(null)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaName, setPersonaName] = useState('')
  const [mcpServers, setMcpServers] = useState<McpServerEntry[]>([])
  const [mcpName, setMcpName] = useState('')
  const [mcpUrl, setMcpUrl] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<InferenceSettings | null>(null)

  useEffect(() => {
    loadSettings().then(setSettings)
    loadPersonas().then(setPersonas)
    loadMcpServers().then(setMcpServers)
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
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
    >
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
      <SelectMenu
        accessibilityLabel="Choose context length"
        leadingIcon="models"
        onSelect={(id) => update({ contextLength: Number(id) })}
        options={CONTEXT_OPTIONS.map((n) => ({
          id: String(n),
          label: `${n} tokens`,
          detail: n === 8192 ? 'Best recall, highest memory use' : n === 4096 ? 'Balanced default' : 'Fastest, shortest memory',
        }))}
        selectedId={String(settings.contextLength)}
        title="Context length"
      />

      <Text style={styles.rowLabel}>Persona</Text>
      <Text style={styles.rowHint}>
        Named system prompts — applied to chat and Agent Mode. Long-press a
        custom persona to delete it.
      </Text>
      <View style={styles.personaRow}>
        {personas.map((p) => {
          const active = settings.systemPrompt === p.prompt
          return (
            <Pressable
              key={p.id}
              style={[styles.personaChip, active && styles.personaChipActive]}
              onPress={() => update({ systemPrompt: p.prompt })}
              onLongPress={() => {
                if (p.builtIn) return
                Alert.alert('Delete persona?', p.name, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => removeCustomPersona(p.id).then(setPersonas),
                  },
                ])
              }}
            >
              <Text style={[styles.personaChipText, active && styles.personaChipTextActive]}>
                {p.name}
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
      <View style={styles.saveAsRow}>
        <TextInput
          style={styles.saveAsInput}
          value={personaName}
          onChangeText={setPersonaName}
          placeholder="Save current prompt as…"
          placeholderTextColor={colors.textFaint}
        />
        <Pressable
          style={[styles.saveAsBtn, !personaName.trim() && { opacity: 0.4 }]}
          disabled={!personaName.trim()}
          onPress={async () => {
            try {
              setPersonas(await saveCustomPersona(personaName, settings.systemPrompt))
              setPersonaName('')
            } catch (e: any) {
              Alert.alert('Could not save persona', e?.message ?? '')
            }
          }}
        >
          <Text style={styles.saveAsBtnText}>Save</Text>
        </Pressable>
      </View>

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

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Allow web access</Text>
          <Text style={styles.rowHint}>
            Lets the agent search the web and read pages, citing sources.
            Off means Marmot is fully offline after model downloads.
          </Text>
        </View>
        <Switch
          value={settings.allowWeb}
          onValueChange={(v) => update({ allowWeb: v })}
          trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
          thumbColor={colors.surface}
        />
      </View>

      <Text style={styles.rowLabel}>MCP servers</Text>
      <Text style={styles.rowHint}>
        Connect the agent to Model Context Protocol servers over HTTP (your
        home server, work tools, Home Assistant…). Their tools appear in
        Agent Mode, namespaced per server. Traffic goes only to servers you
        add here.
      </Text>
      {mcpServers.map((server) => (
        <View key={server.id} style={styles.mcpRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.mcpName}>{server.name}</Text>
            <Text style={styles.mcpUrl} numberOfLines={1}>
              {server.url}
            </Text>
          </View>
          <Switch
            value={server.enabled}
            onValueChange={(v) => setMcpServerEnabled(server.id, v).then(setMcpServers)}
            trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
            thumbColor={colors.surface}
          />
          <Pressable hitSlop={10} onPress={() => removeMcpServer(server.id).then(setMcpServers)}>
            <Text style={styles.mcpDelete}>✕</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.mcpAddRow}>
        <TextInput
          style={[styles.saveAsInput, { flex: 0.7 }]}
          value={mcpName}
          onChangeText={setMcpName}
          placeholder="Name"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.saveAsInput}
          value={mcpUrl}
          onChangeText={setMcpUrl}
          placeholder="https://server/mcp"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.saveAsBtn, (!mcpName.trim() || !mcpUrl.trim()) && { opacity: 0.4 }]}
          disabled={!mcpName.trim() || !mcpUrl.trim()}
          onPress={async () => {
            try {
              setMcpServers(await addMcpServer(mcpName, mcpUrl))
              setMcpName('')
              setMcpUrl('')
            } catch (e: any) {
              Alert.alert('Could not add server', e?.message ?? '')
            }
          }}
        >
          <Text style={styles.saveAsBtnText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>GPU acceleration (Android)</Text>
          <Text style={styles.rowHint}>
            Experimental — offloads the model to the GPU (OpenCL, recent
            Snapdragon chips). If replies fail or the app crashes, turn this
            off. Applies on the next model load. iOS always uses Metal.
          </Text>
        </View>
        <Switch
          value={settings.gpuAndroid}
          onValueChange={(v) => update({ gpuAndroid: v })}
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
        Back up every conversation as a JSON file via the share sheet, or
        restore a backup — imports never overwrite newer local chats.
      </Text>
      <View style={styles.dataRow}>
        <Pressable
          style={[styles.exportBtn, { flex: 1 }]}
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
        <Pressable style={[styles.exportBtn, { flex: 1 }]} onPress={importChats}>
          <Text style={styles.exportText}>Import chats</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

async function importChats() {
  try {
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    })
    if (picked.canceled || !picked.assets?.[0]) return
    const raw = await FileSystem.readAsStringAsync(picked.assets[0].uri)
    const imported = parseChatExport(raw)
    const existing = await loadChats()
    const { chats, added, updated, skipped } = mergeChats(existing, imported)
    Alert.alert(
      'Import chats?',
      `${added} new, ${updated} updated${skipped ? `, ${skipped} skipped (older than local)` : ''}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            await saveAllChats(chats)
            Alert.alert('Done', `Imported ${added + updated} chat${added + updated === 1 ? '' : 's'}.`)
          },
        },
      ]
    )
  } catch (e: any) {
    Alert.alert('Import failed', e?.message ?? 'Could not read that file.')
  }
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
  personaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  personaChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  personaChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  personaChipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  personaChipTextActive: { color: colors.accentText },
  saveAsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: -spacing.md,
    marginBottom: spacing.xl,
  },
  saveAsInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
  },
  saveAsBtn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  saveAsBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  mcpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  mcpName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  mcpUrl: { color: colors.textFaint, fontSize: 11.5, marginTop: 1 },
  mcpDelete: { color: colors.red, fontSize: 15, fontWeight: '700' },
  mcpAddRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
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
  dataRow: { flexDirection: 'row', gap: spacing.md },
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
