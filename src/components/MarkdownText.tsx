import React from 'react'
import { Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { Block, InlineToken, parseMarkdown } from '../lib/markdown'
import { Palette, radius, spacing, themedStyles } from '../theme'
import { useTheme } from '../ThemeContext'

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace'

function Inlines({ tokens, styles }: { tokens: InlineToken[]; styles: ReturnType<typeof getStyles> }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case 'bold':
            return (
              <Text key={i} style={styles.bold}>
                {t.content}
              </Text>
            )
          case 'italic':
            return (
              <Text key={i} style={styles.italic}>
                {t.content}
              </Text>
            )
          case 'code':
            return (
              <Text key={i} style={styles.inlineCode}>
                {t.content}
              </Text>
            )
          case 'link':
            return (
              <Text key={i} style={styles.link} onPress={() => Linking.openURL(t.href).catch(() => {})}>
                {t.content}
              </Text>
            )
          default:
            return <Text key={i}>{t.content}</Text>
        }
      })}
    </>
  )
}

function BlockView({ block, styles }: { block: Block; styles: ReturnType<typeof getStyles> }) {
  switch (block.type) {
    case 'heading':
      return (
        <Text style={[styles.body, styles[`h${block.level}` as 'h1' | 'h2' | 'h3']]}>
          <Inlines tokens={block.inlines} styles={styles} />
        </Text>
      )
    case 'bullet':
      return (
        <View style={styles.listRow}>
          <Text style={[styles.body, styles.marker]}>•</Text>
          <Text style={[styles.body, styles.listText]}>
            <Inlines tokens={block.inlines} styles={styles} />
          </Text>
        </View>
      )
    case 'ordered':
      return (
        <View style={styles.listRow}>
          <Text style={[styles.body, styles.marker]}>{block.index}.</Text>
          <Text style={[styles.body, styles.listText]}>
            <Inlines tokens={block.inlines} styles={styles} />
          </Text>
        </View>
      )
    case 'code':
      return (
        <View style={styles.codeBlock}>
          <Text style={styles.codeText}>{block.content}</Text>
        </View>
      )
    default:
      return (
        <Text style={styles.body}>
          <Inlines tokens={block.inlines} styles={styles} />
        </Text>
      )
  }
}

export default function MarkdownText({ text }: { text: string }) {
  const { colors } = useTheme()
  const styles = getStyles(colors)
  const blocks = parseMarkdown(text)
  return (
    <View style={styles.container}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} styles={styles} />
      ))}
    </View>
  )
}

const getStyles = themedStyles((colors: Palette) =>
  StyleSheet.create({
    container: { gap: spacing.sm },
    body: { color: colors.text, fontSize: 15, lineHeight: 22 },
    bold: { fontWeight: '700' },
    italic: { fontStyle: 'italic' },
    inlineCode: {
      fontFamily: MONO,
      fontSize: 13.5,
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
    },
    link: { color: colors.accent, textDecorationLine: 'underline' },
    h1: { fontSize: 19, fontWeight: '700' },
    h2: { fontSize: 17, fontWeight: '700' },
    h3: { fontSize: 15.5, fontWeight: '700' },
    listRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    marker: { color: colors.textDim, minWidth: 18 },
    listText: { flexShrink: 1 },
    codeBlock: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    codeText: { fontFamily: MONO, fontSize: 12.5, color: colors.text, lineHeight: 18 },
  })
)
