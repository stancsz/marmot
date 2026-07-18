import React, { useCallback, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { agentDocuments, agentMemory } from '../lib/agentRuntime'
import { importGitHubRepo } from '../lib/repoImport'
import { MemoryEntry, MemoryKind, StoredDocument } from '../agent'
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
  const [docs, setDocs] = useState<StoredDocument[]>([])
  const [draft, setDraft] = useState('')
  const [draftKind, setDraftKind] = useState<MemoryKind>('user')
  const [addingDoc, setAddingDoc] = useState(false)
  const [repoDraft, setRepoDraft] = useState('')
  const [importingRepo, setImportingRepo] = useState(false)

  const importRepo = async () => {
    const input = repoDraft.trim()
    if (!input) return
    setImportingRepo(true)
    try {
      const doc = await importGitHubRepo(input)
      setRepoDraft('')
      refresh()
      Alert.alert('Repository imported', `${doc.name} — ${doc.chunkCount} searchable passages.`)
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Could not import that repository.')
    } finally {
      setImportingRepo(false)
    }
  }

  const refresh = useCallback(() => {
    agentMemory.all().then((all) => setEntries(all.sort((a, b) => b.createdAt - a.createdAt)))
    agentDocuments.documents().then(setDocs)
  }, [])

  const addDocument = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown', 'text/*'],
        copyToCacheDirectory: true,
      })
      if (picked.canceled || !picked.assets?.[0]) return
      setAddingDoc(true)
      const asset = picked.assets[0]
      const text = await FileSystem.readAsStringAsync(asset.uri)
      const doc = await agentDocuments.addDocument(asset.name ?? 'Untitled', text)
      refresh()
      Alert.alert('Document added', `${doc.name} — ${doc.chunkCount} searchable passages.`)
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Could not read that file.')
    } finally {
      setAddingDoc(false)
    }
  }

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

      {/* documents (RAG) */}
      <View style={styles.docHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Documents</Text>
          <Text style={styles.sectionHint}>
            Text and markdown files the agent can search by meaning
            (search_documents tool).
          </Text>
        </View>
        <Pressable onPress={addDocument} disabled={addingDoc} hitSlop={8}>
          <Text style={styles.addDocLink}>{addingDoc ? 'Adding…' : '+ Add'}</Text>
        </Pressable>
      </View>
      <View style={styles.repoRow}>
        <TextInput
          style={styles.repoInput}
          value={repoDraft}
          onChangeText={setRepoDraft}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Import a GitHub repo… e.g. vercel/swr"
          placeholderTextColor={colors.textFaint}
        />
        <Pressable
          style={[styles.repoBtn, (!repoDraft.trim() || importingRepo) && { opacity: 0.4 }]}
          disabled={!repoDraft.trim() || importingRepo}
          onPress={importRepo}
        >
          <Text style={styles.repoBtnText}>{importingRepo ? '…' : 'Import'}</Text>
        </Pressable>
      </View>
      {docs.length === 0 && <Text style={styles.emptyText}>No documents yet.</Text>}
      {docs.map((d) => (
        <View key={d.id} style={styles.entryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryText}>{d.name}</Text>
            <Text style={styles.entryDate}>
              {d.chunkCount} passages · {new Date(d.addedAt).toLocaleDateString()}
            </Text>
          </View>
          <Pressable
            hitSlop={10}
            onPress={async () => {
              await agentDocuments.removeDocument(d.id)
              refresh()
            }}
          >
            <Text style={styles.deleteX}>✕</Text>
          </Pressable>
        </View>
      ))}

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
    docHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
    addDocLink: { color: colors.accent, fontSize: 14, fontWeight: '600', paddingBottom: spacing.sm },
    repoRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    repoInput: {
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
    repoBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
    },
    repoBtnText: { color: colors.accentText, fontSize: 13, fontWeight: '700' },
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
