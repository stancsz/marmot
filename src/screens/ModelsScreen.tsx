import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { CATALOG, formatBytes } from '../models/catalog'
import { downloads } from '../lib/downloads'
import { engine } from '../lib/engine'
import { ramFit, ramFitLabel, totalRamLabel } from '../lib/deviceMemory'
import { DownloadState, ModelId, ModelSpec } from '../types'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'

export default function ModelsScreen() {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const [states, setStates] = useState<Record<ModelId, DownloadState>>({})
  const [freeBytes, setFreeBytes] = useState<number | null>(null)
  const statusSignature = useRef('')

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    downloads.init().then(() => {
      if (cancelled) return
      unsub = downloads.subscribe((next) => {
        setStates(next)
        // refresh free space when any download finishes or a model is
        // deleted — but not on every progress tick
        const sig = CATALOG.map((m) => next[m.id]?.status ?? 'idle').join(',')
        if (sig !== statusSignature.current) {
          statusSignature.current = sig
          downloads.freeDiskBytes().then((b) => !cancelled && setFreeBytes(b)).catch(() => {})
        }
      })
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  const downloaded = CATALOG.filter((m) => states[m.id]?.status === 'done')
  const available = CATALOG.filter((m) => states[m.id]?.status !== 'done')

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.headerRow}>
        <Text style={styles.headerHint}>
          {totalRamLabel()}
          {freeBytes != null ? `  ·  ${formatBytes(freeBytes)} free` : ''}
        </Text>
      </View>

      {downloaded.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>On this device</Text>
          {downloaded.map((m) => (
            <ModelCard key={m.id} spec={m} state={states[m.id]} />
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>Available</Text>
      {available.map((m) => (
        <ModelCard key={m.id} spec={m} state={states[m.id]} />
      ))}

      <Text style={styles.footnote}>
        Models are quantized GGUF builds downloaded from Hugging Face and run
        with llama.cpp — nothing leaves your phone after download.
      </Text>
    </ScrollView>
  )
}

function ModelCard({ spec, state }: { spec: ModelSpec; state?: DownloadState }) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const status = state?.status ?? 'idle'
  const fit = ramFit(spec.sizeBytes)
  const fitColor =
    fit === 'great' ? colors.green : fit === 'ok' ? colors.yellow : colors.red

  const confirmDelete = () => {
    Alert.alert('Delete model?', `${spec.name} (${formatBytes(spec.sizeBytes)}) will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (engine.getLoadedModelId() === spec.id) await engine.unload()
          await downloads.remove(spec.id)
        },
      },
    ])
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{spec.name}</Text>
          <Text style={styles.cardSub}>
            {spec.family} · {spec.params} · {spec.quant} · {formatBytes(spec.sizeBytes)}
          </Text>
        </View>
        {fit !== 'unknown' && (
          <Text style={[styles.fitBadge, { color: fitColor, borderColor: fitColor }]}>
            {ramFitLabel(fit)}
          </Text>
        )}
      </View>

      <Text style={styles.cardDesc}>{spec.description}</Text>
      <Text style={styles.license}>{spec.license}</Text>

      {status === 'downloading' || status === 'paused' ? (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${Math.round((state?.progress ?? 0) * 100)}%` }]}
            />
          </View>
          <Text style={styles.progressText}>
            {formatBytes(state?.receivedBytes ?? 0)} / {formatBytes(state?.totalBytes ?? spec.sizeBytes)}
            {status === 'paused' ? ' · paused' : ''}
          </Text>
        </View>
      ) : null}

      {status === 'error' && <Text style={styles.errorText}>{state?.error}</Text>}

      <View style={styles.btnRow}>
        {status === 'idle' || status === 'error' ? (
          <Btn label={status === 'error' ? 'Retry' : 'Download'} onPress={() => downloads.start(spec.id)} primary />
        ) : null}
        {status === 'downloading' && (
          <>
            <Btn label="Pause" onPress={() => downloads.pause(spec.id)} />
            <Btn label="Cancel" onPress={() => downloads.cancel(spec.id)} danger />
          </>
        )}
        {status === 'paused' && (
          <>
            <Btn label="Resume" onPress={() => downloads.start(spec.id)} primary />
            <Btn label="Cancel" onPress={() => downloads.cancel(spec.id)} danger />
          </>
        )}
        {status === 'done' && <Btn label="Delete" onPress={confirmDelete} danger />}
      </View>
    </View>
  )
}

function Btn({
  label,
  onPress,
  primary,
  danger,
}: {
  label: string
  onPress: () => void
  primary?: boolean
  danger?: boolean
}) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  return (
    <Pressable
      style={[styles.btn, primary && styles.btnPrimary, danger && styles.btnDanger]}
      onPress={onPress}
      hitSlop={8}
    >
      <Text
        style={[
          styles.btnText,
          primary && styles.btnTextPrimary,
          danger && styles.btnTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { marginBottom: spacing.sm },
  headerHint: { color: colors.textFaint, fontSize: 13 },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  cardSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  fitBadge: {
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  cardDesc: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  license: { color: colors.textFaint, fontSize: 11 },
  progressWrap: { gap: spacing.xs },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: colors.accent },
  progressText: { color: colors.textDim, fontSize: 12 },
  errorText: { color: colors.red, fontSize: 12 },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  btn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnDanger: { backgroundColor: 'transparent', borderColor: colors.red },
  btnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  btnTextPrimary: { color: colors.accentText },
  btnTextDanger: { color: colors.red },
  footnote: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.lg,
    marginBottom: 40,
  },
})
)
