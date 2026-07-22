import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as Clipboard from 'expo-clipboard'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import type { EntityTypes as CalendarEntityType } from 'expo-calendar'
import * as Calendar from 'expo-calendar/legacy'
import { engine } from '../lib/engine'
import { downloads } from '../lib/downloads'
import { agentDocuments } from '../lib/agentRuntime'
import { loadSettings } from '../lib/chatStore'
import { TEXT_ACTION_GROUPS, TEXT_ACTIONS, TextAction } from '../lib/textActions'
import { appendVoiceTranscript } from '../lib/voiceInput'
import { ActionCard, actionCardFor, saveActionCard } from '../lib/actionCards'
import { calendarEventCard, hasExplicitCalendarTime, normalizeCalendarEvent } from '../lib/phoneActions'
import { createApprovedResultShareCard, renderApprovedResultShareCard } from '../lib/shareCards'
import { buildCompletionMessages } from '../lib/attachmentContext'
import { getModel } from '../models/catalog'
import { splitThinking, visibleAnswer } from '../lib/thinking'
import MarkdownText from '../components/MarkdownText'
import AttachmentChip from '../components/AttachmentChip'
import Icon, { IconName } from '../components/Icon'
import IconButton from '../components/IconButton'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'
import type { RootStackParamList } from '../navigation'
import type { Attachment, ModelId } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'Ingest'>
const EVENT_ENTITY_TYPE: CalendarEntityType = Calendar.EntityTypes.EVENT

const ACTION_ICONS: Record<TextAction['icon'], IconName> = {
  summarize: 'summarize',
  keyPoints: 'keyPoints',
  proofread: 'proofread',
  translate: 'translate',
  tone: 'tone',
  reply: 'reply',
  explain: 'explain',
  privacy: 'privacy',
  observation: 'observation',
  subtask: 'subtask',
}

export default function IngestScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [text, setText] = useState(route.params?.text ?? '')
  const [attachment, setAttachment] = useState<Attachment | null>(route.params?.attachment ?? null)
  const [downloadedIds, setDownloadedIds] = useState<ModelId[]>(() => downloads.downloadedModelIds())
  const [listening, setListening] = useState(false)
  const [voicePreview, setVoicePreview] = useState('')
  const listeningRef = useRef(false)
  const requestRef = useRef(0)

  // a share/deep-link can arrive while this screen is already open — adopt
  // the new text instead of silently keeping the old one (found in E2E)
  const [activeAction, setActiveAction] = useState<TextAction | null>(null)
  const [pendingOptions, setPendingOptions] = useState<TextAction | null>(null)
  const [result, setResult] = useState('')
  const [actionCard, setActionCard] = useState<ActionCard | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [thinkingLive, setThinkingLive] = useState(false)
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    requestRef.current += 1
    void engine.stop()
    setText(route.params?.text ?? '')
    setAttachment(route.params?.attachment ?? null)
    setActiveAction(null)
    setPendingOptions(null)
    setResult('')
    setActionCard(null)
    setBusy(false)
    setBusyLabel('')
    setThinkingLive(false)
    setApproving(false)
  }, [route.params?.text, route.params?.attachment])

  useEffect(() => {
    let cancelled = false
    const unsubscribe = downloads.subscribe(() => {
      if (!cancelled) setDownloadedIds(downloads.downloadedModelIds())
    })
    downloads
      .init()
      .then(() => {
        if (!cancelled) setDownloadedIds(downloads.downloadedModelIds())
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [attachment?.uri])

  useEffect(() => () => {
    if (listeningRef.current) ExpoSpeechRecognitionModule.stop()
  }, [])

  useSpeechRecognitionEvent('result', (event) => {
    const heard = event.results?.[0]?.transcript ?? ''
    if (!heard.trim()) return
    if (!event.isFinal) {
      setVoicePreview(heard)
      return
    }
    listeningRef.current = false
    setListening(false)
    setVoicePreview('')
    setText((current) => appendVoiceTranscript(current, heard))
    ExpoSpeechRecognitionModule.stop()
  })

  useSpeechRecognitionEvent('end', () => {
    listeningRef.current = false
    setListening(false)
    setVoicePreview('')
  })

  useSpeechRecognitionEvent('error', (event) => {
    listeningRef.current = false
    setListening(false)
    setVoicePreview('')
    if (event.error === 'not-allowed') {
      Alert.alert('Microphone needed', 'Allow microphone and speech recognition access to dictate a command.')
    }
  })

  const toggleVoiceInput = useCallback(async () => {
    if (listeningRef.current) {
      listeningRef.current = false
      setListening(false)
      setVoicePreview('')
      ExpoSpeechRecognitionModule.stop()
      return
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Microphone needed', 'Allow microphone and speech recognition access to dictate a command.')
      return
    }
    try {
      listeningRef.current = true
      setListening(true)
      setVoicePreview('Listening…')
      ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: false })
    } catch (error: any) {
      listeningRef.current = false
      setListening(false)
      setVoicePreview('')
      Alert.alert('Voice input unavailable', error?.message ?? 'Speech recognition could not start.')
    }
  }, [])

  const run = useCallback(
    async (action: TextAction, option?: string) => {
      const input = text.trim()
      if (!input) return
      const requestId = ++requestRef.current
      setPendingOptions(null)
      setActiveAction(action)
      setResult('')
      setActionCard(null)
      setBusy(true)
      setBusyLabel(action.label)
      try {
        if (action.runLocally) {
          const content = action.runLocally(input)
          setResult(content)
          setActionCard(actionCardFor(action.id, content, option, { sourceText: input }))
          return
        }
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
        if (requestRef.current !== requestId) return
        const content = visibleAnswer(completion.text)
        setResult(content)
        setActionCard(actionCardFor(action.id, content, option, { sourceText: input }))
      } catch (e: any) {
        if (requestRef.current === requestId) Alert.alert('Action failed', e?.message ?? 'Generation failed')
      } finally {
        if (requestRef.current === requestId) {
          setBusy(false)
          setBusyLabel('')
          setThinkingLive(false)
        }
      }
    },
    [text]
  )

  const extractCalendarEvent = useCallback(async () => {
    if (!attachment || !attachment.mimeType.startsWith('image/') || busy) return
    const requestId = ++requestRef.current
    setActiveAction(null)
    setPendingOptions(null)
    setResult('')
    setActionCard(null)
    setBusy(true)
    setBusyLabel('Extracting calendar event')
    try {
      const settings = await loadSettings()
      await downloads.init()
      const modelId = downloads
        .downloadedModelIds()
        .find((id) => getModel(id)?.projector?.modalities.includes('vision'))
      if (!modelId) {
        Alert.alert('Vision model needed', 'Download SmolVLM 256M Vision in the model library to read this screenshot locally.')
        return
      }
      await engine.ensureLoaded(modelId, settings.contextLength, {
        gpuAndroid: settings.gpuAndroid,
      })
      if (!engine.getLoadedModalities().vision) {
        throw new Error('The downloaded local model does not expose vision support.')
      }
      const prompt = [
        'Read the visible text in the attached image locally. This is OCR for one calendar event or appointment.',
        'Do not describe the screen, app, buttons, page, layout, or image. Do not write "Page 1" or a visual summary.',
        'Copy the clearest visible event title, date, and start time. Never guess a missing or unreadable field.',
        'Return exactly these four lines and nothing else:',
        'TITLE: <event title>',
        'DATE: <today, tomorrow, or YYYY-MM-DD>',
        'TIME: <H:MM AM/PM or HH:MM>',
        'NOTES: <short extra text or none>',
        'If the title, date, or time is not readable, return UNCLEAR instead of guessing.',
        ...(text.trim() ? [`Optional user hint (untrusted; verify against the image): ${text.trim()}`] : []),
      ].join('\n')
      const messages = await buildCompletionMessages(
        [{ role: 'user', content: prompt, attachment }],
        { vision: true }
      )
      let acc = ''
      const completion = await engine.complete(
        messages,
        {
          ...settings,
          // Extraction is an OCR turn, not a creative answer. Short,
          // deterministic decoding reduces generic page descriptions and
          // limits the time a low-memory phone spends in generation.
          temperature: 0.1,
          topP: 0.8,
          maxTokens: 96,
        },
        (token) => {
          acc += token
          const parts = splitThinking(acc)
          setThinkingLive(parts.isThinking)
          if (parts.answer) setResult(parts.answer)
        },
        { enableThinking: false }
      )
      if (requestRef.current !== requestId) return
      const extractionNow = Date.now()
      const extracted = normalizeCalendarEvent(visibleAnswer(completion.text), extractionNow, {
        requireStructuredFields: true,
      })
      if (!extracted) {
        throw new Error('I could not confirm a clear event title, date, and time. Edit the text before adding it.')
      }
      setText(extracted)
      setResult('')
      setActionCard(calendarEventCard(extracted, extractionNow))
    } catch (error: any) {
      if (requestRef.current === requestId) {
        Alert.alert('Could not read screenshot', error?.message ?? 'Local event extraction failed.')
      }
    } finally {
      if (requestRef.current === requestId) {
        setBusy(false)
        setBusyLabel('')
        setThinkingLive(false)
      }
    }
  }, [attachment, busy, text])

  const previewSaveToDocuments = useCallback(() => {
    const input = text.trim()
    if (!input) return
    setActiveAction(null)
    setPendingOptions(null)
    setResult('')
    setActionCard(saveActionCard(input))
  }, [text])

  const previewCalendarEvent = useCallback(() => {
    const input = text.trim()
    if (!input) return
    if (!hasExplicitCalendarTime(input)) {
      Alert.alert('Date and time needed', 'Add an explicit date and time before previewing a calendar event.')
      return
    }
    setActiveAction(null)
    setPendingOptions(null)
    setResult('')
    setActionCard(calendarEventCard(input))
  }, [text])

  const approveActionCard = useCallback(async () => {
    if (!actionCard || actionCard.status !== 'preview' || approving) return
    const requestId = requestRef.current
    setApproving(true)
    if (actionCard.kind === 'save_document' && actionCard.status === 'preview') {
      try {
        const title = `Shared ${new Date().toLocaleString()}`
        const doc = await agentDocuments.addDocument(title, actionCard.content)
        if (requestRef.current === requestId) setActionCard({ ...actionCard, status: 'approved' })
        Alert.alert('Saved', `"${doc.name}" — ${doc.chunkCount} searchable passages.`)
      } catch (e: any) {
        Alert.alert('Could not save', e?.message ?? '')
      }
      setApproving(false)
      return
    }
    if (actionCard.kind === 'draft_reply' && actionCard.requiresApproval) {
      if (requestRef.current === requestId) setActionCard({ ...actionCard, status: 'approved' })
      setApproving(false)
      return
    }
    if (
      actionCard.kind !== 'calendar_event' ||
      actionCard.status !== 'preview' ||
      !actionCard.phoneAction
    ) {
      setApproving(false)
      return
    }
    try {
      const permission = await Calendar.requestCalendarPermissionsAsync()
      if (permission.status !== 'granted') {
        Alert.alert('Calendar access needed', 'Allow calendar access to add this approved event.')
        setApproving(false)
        return
      }
      const calendars = await Calendar.getCalendarsAsync(EVENT_ENTITY_TYPE)
      const calendar = calendars.find((item) => item.allowsModifications)
      const calendarId = calendar?.id ?? await Calendar.createCalendarAsync({
        title: 'Marmot',
        name: 'Marmot',
        color: '#111111',
        entityType: Calendar.EntityTypes.EVENT,
        source: {
          type: Calendar.SourceType.LOCAL,
          name: 'Marmot',
          isLocalAccount: true,
        },
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
        ownerAccount: 'Marmot',
      })
      const eventId = await Calendar.createEventAsync(calendarId, {
        title: actionCard.phoneAction.title,
        notes: actionCard.phoneAction.notes,
        startDate: actionCard.phoneAction.startDate,
        endDate: actionCard.phoneAction.endDate,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (requestRef.current === requestId) {
        setActionCard({
          ...actionCard,
          status: 'approved',
          phoneAction: { ...actionCard.phoneAction, eventId },
        })
      }
      setApproving(false)
    } catch (e: any) {
      Alert.alert('Could not add event', e?.message ?? 'Calendar action failed.')
      setApproving(false)
    }
  }, [actionCard, approving])

  const undoCalendarAction = useCallback(async () => {
    if (actionCard?.kind !== 'calendar_event' || actionCard.status !== 'approved') return
    const phoneAction = actionCard.phoneAction
    const eventId = phoneAction?.eventId
    if (!eventId) return
    try {
      await Calendar.deleteEventAsync(eventId)
      setActionCard({
        ...actionCard,
        status: 'discarded',
        phoneAction: { ...phoneAction, eventId: undefined, undone: true },
      })
    } catch (e: any) {
      Alert.alert('Could not undo event', e?.message ?? 'Calendar action failed.')
    }
  }, [actionCard])

  const discardActionCard = useCallback(() => {
    if (actionCard) setActionCard({ ...actionCard, status: 'discarded' })
  }, [actionCard])

  const copyActionCard = useCallback(async () => {
    if (!actionCard) return
    await Clipboard.setStringAsync(actionCard.content)
    Alert.alert('Copied')
  }, [actionCard])

  const useActionCardAsInput = useCallback(() => {
    if (!actionCard) return
    setText(actionCard.content)
    if (actionCard.status === 'preview') {
      setActionCard(null)
      setResult('')
    }
  }, [actionCard])

  const shareApprovedActionCard = useCallback(async (includeAttribution: boolean) => {
    if (!actionCard || actionCard.status !== 'approved') return
    const shareCard = createApprovedResultShareCard(actionCard, {
      sourceSummary: text.trim() || (attachment ? 'Shared screenshot' : 'Shared content'),
      includeAttribution,
      installUrl: 'https://github.com/stancsz/marmot/releases/latest/download/marmot.apk',
      githubUrl: 'https://github.com/stancsz/marmot',
    })
    if (!shareCard) {
      Alert.alert('Nothing to share', 'This approved result has no shareable content.')
      return
    }
    try {
      await Share.share({
        message: renderApprovedResultShareCard(shareCard),
        title: shareCard.title,
      })
    } catch (error: any) {
      Alert.alert('Could not share result', error?.message ?? 'The share sheet could not be opened.')
    }
  }, [actionCard, attachment, text])

  const handleTextChange = useCallback((value: string) => {
    setText(value)
    // A preview is derived from the previous text. Drop it as soon as the
    // visible input changes so approval can never execute a stale event.
    if (actionCard?.status === 'preview') {
      setActionCard(null)
      setResult('')
    }
  }, [actionCard])

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <View style={styles.inputCard}>
        <View style={styles.inputToolbar}>
          <View style={styles.inputLabelRow}>
            <Icon name="quickActions" size={16} tintColor={colors.textDim} />
            <Text style={styles.inputLabel}>Command input</Text>
          </View>
          <IconButton
            accessibilityLabel={listening ? 'Stop voice input' : 'Use voice input'}
            accessibilityHint={listening ? 'Stops dictation' : 'Dictates a command into this box'}
            icon={listening ? 'stop' : 'mic'}
            onPress={toggleVoiceInput}
            variant={listening ? 'danger' : 'secondary'}
          />
        </View>
        <TextInput
          style={styles.input}
          multiline
          value={text}
          onChangeText={handleTextChange}
          editable={!busy && !listening}
          placeholder="Paste, share, or dictate text here"
          placeholderTextColor={colors.textFaint}
        />
        {attachment ? (
          <AttachmentChip
            attachment={attachment}
            capabilities={{
              vision:
                engine.getLoadedModalities().vision ||
                downloadedIds.some((id) => Boolean(getModel(id)?.projector)),
            }}
            onClear={() => setAttachment(null)}
          />
        ) : null}
        {voicePreview ? <Text style={styles.voicePreview}>Heard: {voicePreview}</Text> : null}
      </View>

      {/* grouped action chips */}
      <View style={styles.actionGroups}>
        {TEXT_ACTION_GROUPS.map((group) => (
          <View key={group.label} style={styles.actionGroup}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            <View style={styles.chipRow}>
              {group.actions.map((action) => (
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
                  <View style={styles.chipContent}>
                    <Icon
                      name={ACTION_ICONS[action.icon]}
                      size={16}
                      tintColor={activeAction?.id === action.id ? colors.accentText : colors.textDim}
                    />
                    <Text style={[styles.chipText, activeAction?.id === action.id && styles.chipTextActive]}>
                      {action.label}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <View style={styles.actionGroup}>
          <Text style={styles.groupLabel}>Phone actions</Text>
          <View style={styles.chipRow}>
            <Pressable
              disabled={!text.trim()}
              style={[styles.chip, !text.trim() && { opacity: 0.45 }]}
              onPress={previewSaveToDocuments}
            >
              <View style={styles.chipContent}>
                <Icon name="file" size={16} tintColor={colors.textDim} />
                <Text style={styles.chipText}>Save to documents</Text>
              </View>
            </Pressable>
            <Pressable
              disabled={!text.trim()}
              style={[styles.chip, !text.trim() && { opacity: 0.45 }]}
              onPress={previewCalendarEvent}
            >
              <View style={styles.chipContent}>
                <Icon name="calendar" size={16} tintColor={colors.textDim} />
                <Text style={styles.chipText}>Add to calendar</Text>
              </View>
            </Pressable>
            {attachment?.mimeType.startsWith('image/') ? (
              <Pressable
                disabled={busy}
                style={[styles.chip, busy && { opacity: 0.45 }]}
                onPress={extractCalendarEvent}
              >
                <View style={styles.chipContent}>
                  <Icon name="image" size={16} tintColor={colors.textDim} />
                  <Text style={styles.chipText}>Extract calendar event</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>
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
            {thinkingLive ? 'Thinking…' : `${busyLabel || activeAction?.label || 'Working'}…`}
          </Text>
        </View>
      )}

      {result !== '' && !actionCard && (
        <View style={styles.resultCard}>
          <MarkdownText text={result} />
        </View>
      )}
      {actionCard && (
        <ActionCardView
          card={actionCard}
          onApprove={approveActionCard}
          onCopy={copyActionCard}
          onDiscard={discardActionCard}
          onShare={shareApprovedActionCard}
          approving={approving}
          onUndo={undoCalendarAction}
          onUseAsInput={useActionCardAsInput}
        />
      )}
    </ScrollView>
  )
}

function ActionCardView({
  card,
  onApprove,
  onCopy,
  onDiscard,
  onShare,
  approving,
  onUndo,
  onUseAsInput,
}: {
  card: ActionCard
  onApprove: () => void
  onCopy: () => void
  onDiscard: () => void
  onShare: (includeAttribution: boolean) => void
  approving: boolean
  onUndo: () => void
  onUseAsInput: () => void
}) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const source = TEXT_ACTIONS.find((action) => action.id === card.sourceAction)
  const icon = card.kind === 'calendar_event' ? 'calendar' : source ? ACTION_ICONS[source.icon] : 'file'
  const statusText =
    card.status === 'approved'
      ? card.kind === 'calendar_event' ? 'Added to calendar'
        : card.kind === 'save_document' ? 'Saved to documents'
          : 'Approved locally'
      : card.status === 'discarded'
        ? card.phoneAction?.undone ? 'Removed from calendar' : 'Discarded'
        : card.requiresApproval
          ? card.kind === 'calendar_event' ? 'Preview only · Not added' : 'Preview only · Not sent'
          : 'Preview generated locally'

  return (
    <View style={styles.resultCard} accessible accessibilityRole="summary">
      <View style={styles.resultHeader}>
        <Icon name={icon} size={18} tintColor={colors.accent} />
        <View style={styles.resultHeading}>
          <Text style={styles.resultTitle}>{card.title}</Text>
          <Text style={styles.resultMeta}>{statusText}</Text>
        </View>
      </View>
      {card.qualityWarning ? <Text style={styles.resultWarning}>{card.qualityWarning}</Text> : null}
      {card.phoneAction ? (
        <View style={styles.phoneActionDetails}>
          <Text style={styles.phoneActionTitle}>{card.phoneAction.title}</Text>
          <Text style={styles.phoneActionTime}>
            {formatCalendarRange(card.phoneAction.startDate, card.phoneAction.endDate)}
          </Text>
          <Text style={styles.phoneActionNotes}>{card.phoneAction.notes}</Text>
        </View>
      ) : (
        <MarkdownText text={card.content} />
      )}
      {card.status === 'preview' && (
        <View style={styles.resultActions}>
          {card.kind === 'calendar_event' ? (
            <Pressable disabled={approving} style={[styles.resultBtn, styles.resultBtnPrimary, approving && { opacity: 0.45 }]} onPress={onApprove}>
              <Text style={styles.resultBtnPrimaryText}>Add to calendar</Text>
            </Pressable>
          ) : card.kind === 'save_document' ? (
            <Pressable disabled={approving} style={[styles.resultBtn, styles.resultBtnPrimary, approving && { opacity: 0.45 }]} onPress={onApprove}>
              <Text style={styles.resultBtnPrimaryText}>Save to documents</Text>
            </Pressable>
          ) : (
            <>
              {card.requiresApproval ? (
                <Pressable disabled={approving} style={[styles.resultBtn, styles.resultBtnPrimary, approving && { opacity: 0.45 }]} onPress={onApprove}>
                  <Text style={styles.resultBtnPrimaryText}>Approve draft</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.resultBtn} onPress={onCopy}>
                <Text style={styles.resultBtnText}>Copy</Text>
              </Pressable>
              <Pressable style={styles.resultBtn} onPress={onUseAsInput}>
                <Text style={styles.resultBtnText}>Use as input</Text>
              </Pressable>
            </>
          )}
          <Pressable style={styles.resultBtn} onPress={onDiscard}>
            <Text style={styles.resultBtnText}>Dismiss</Text>
          </Pressable>
        </View>
      )}
      {card.status === 'approved' && (
        <View style={styles.resultActions}>
          <Pressable style={[styles.resultBtn, styles.resultBtnPrimary]} onPress={() => onShare(true)}>
            <Text style={styles.resultBtnPrimaryText}>Share card</Text>
          </Pressable>
          <Pressable style={styles.resultBtn} onPress={() => onShare(false)}>
             <Text style={styles.resultBtnText}>Share without attribution</Text>
          </Pressable>
          {card.kind === 'calendar_event' && (
          <Pressable style={styles.resultBtn} onPress={onUndo}>
            <Text style={styles.resultBtnText}>Undo event</Text>
          </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

function formatCalendarRange(startDate: Date, endDate: Date): string {
  const day = startDate.toLocaleDateString()
  const start = startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const end = endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${start}–${end}`
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    inputCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    inputToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    inputLabel: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
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
    voicePreview: { color: colors.textDim, fontSize: 13, marginTop: spacing.sm },
    actionGroups: { gap: spacing.xl, marginTop: spacing.xl },
    actionGroup: {},
    groupLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
    chip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderCurve: 'continuous',
    },
    chipContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderCurve: 'continuous',
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
    resultHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
    resultHeading: { flex: 1, gap: 2 },
    resultTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
    resultMeta: { color: colors.textDim, fontSize: 12 },
    resultWarning: { color: colors.yellow, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
    phoneActionDetails: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    phoneActionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    phoneActionTime: { color: colors.accent, fontSize: 13, fontWeight: '600' },
    phoneActionNotes: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
    resultActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    resultBtn: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resultBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
    resultBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
    resultBtnPrimaryText: { color: colors.accentText, fontSize: 13, fontWeight: '700' },
  })
)
