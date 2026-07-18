import React, { useCallback, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { agentMemory } from '../lib/agentRuntime'
import { MemoryEntry, MemoryKind } from '../agent'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'

const KINDS: { key: MemoryKind; label: string; hint: string }[] = [
  { key: 'user', label: 'About you', hint: 'Preferences and facts the agent should remember about you.' },
  { key: 'project', label: 'Projects', hint: 'Ongoing work and context you want carried across chats.' },
  { key: 'episodic', label: 'Recent activity', hint: 'Auto-captured summaries of past exchanges (kept to the last 50).' },
]

export default function MemoryScreen() {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [draft, setDraft] = useState('')
  const [draftKind, setDraftKind] = useState<MemoryKind>('user')

  const refresh = useCallback(() => {
    agentMemory.all().then((all) => setEntries(all.sort((a, b) => b.createdAt - a.createdAt)))
  }, [])

  useFocusEffect(refresh)

  const addDraft = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await agentMemory.add(draftKind, text)
    refresh()
  }

  const remove = async (id: string) => {
    await agentMemory.remove(id)
    refresh()
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <Text style={styles.intro}>
        In Agent Mode, memories are recalled by meaning (semantic embeddings
        from the loaded model) and injected into context. Everything stays on
        this device.
      </Text>

      {/* add form (episodic is auto-captured, not hand-written) */}
      <View style={styles.addCard}>
        <View style={styles.kindRow}>
          {KINDS.filter((k) => k.key !== 'episodic').map((k) => {
            const active = draftKind === k.key
            return (
              <Pressable
                key={k.key}
                style={[styles.kindChip, active && styles.kindChipActive]}
                onPress={() => setDraftKind(k.key)}
              >
                <Text style={[styles.kindChipText, active && styles.kindChipTextActive]}>
                  {k.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <TextInput
          style={styles.input}
          placeholder="e.g. I prefer answers in bullet points"
          placeholderTextColor={colors.textFaint}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable
          style={[styles.addBtn, !draft.trim() && { opacity: 0.4 }]}
          disabled={!draft.trim()}
          onPress={addDraft}
        >
          <Text style={styles.addBtnText}>Remember this</Text>
        </Pressable>
      </View>

      {KINDS.map((kind) => {
        const rows = entries.filter((e) => e.kind === kind.key)
        return (
          <View key={kind.key}>
            <Text style={styles.sectionTitle}>{kind.label}</Text>
            <Text style={styles.sectionHint}>{kind.hint}</Text>
            {rows.length === 0 && <Text style={styles.emptyText}>Nothing here yet.</Text>}
            {rows.map((e) => (
              <View key={e.id} style={styles.entryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryText}>{e.text}</Text>
                  <Text style={styles.entryDate}>{new Date(e.createdAt).toLocaleDateString()}</Text>
                </View>
                <Pressable hitSlop={10} onPress={() => remove(e.id)}>
                  <Text style={styles.deleteX}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )
      })}
    </ScrollView>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    intro: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginBottom: spacing.lg },
    addCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    kindRow: { flexDirection: 'row', gap: spacing.sm },
    kindChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    kindChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    kindChipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
    kindChipTextActive: { color: colors.accentText },
    input: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      color: colors.text,
      padding: spacing.md,
      minHeight: 60,
      fontSize: 14,
      textAlignVertical: 'top',
    },
    addBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    addBtnText: { color: colors.accentText, fontWeight: '700', fontSize: 14 },
    sectionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      marginTop: spacing.lg,
    },
    sectionHint: { color: colors.textFaint, fontSize: 12, marginTop: 2, marginBottom: spacing.sm },
    emptyText: { color: colors.textFaint, fontSize: 13, marginBottom: spacing.sm },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    entryText: { color: colors.text, fontSize: 13, lineHeight: 19 },
    entryDate: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
    deleteX: { color: colors.red, fontSize: 15, fontWeight: '700' },
  })
)
