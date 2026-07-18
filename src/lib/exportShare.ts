import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { Chat } from '../types'
import { resolveModel } from './customModels'

/**
 * Chat export goes through the OS share sheet, so users can send to Google
 * Drive, OneDrive, Files, email — whatever they have installed — without
 * Marmot ever holding a cloud credential. Markdown for humans, JSON for
 * full-fidelity backup/re-import.
 */

const EXPORT_VERSION = 1

function safeFilename(name: string): string {
  const cleaned = name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-')
  return (cleaned || 'chat').slice(0, 40)
}

function chatToMarkdown(chat: Chat): string {
  const model = resolveModel(chat.modelId)
  const lines: string[] = [
    `# ${chat.title}`,
    '',
    `_${model ? model.name : 'Unknown model'} · exported ${new Date().toLocaleString()} · Marmot_`,
    '',
  ]
  for (const m of chat.messages) {
    const speaker = m.role === 'user' ? 'You' : model?.name ?? 'Assistant'
    lines.push(`**${speaker}:**`, '', m.content.trim(), '')
  }
  return lines.join('\n')
}

async function shareFile(
  filename: string,
  contents: string,
  mimeType: string
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device')
  }
  const uri = `${FileSystem.cacheDirectory}${filename}`
  await FileSystem.writeAsStringAsync(uri, contents)
  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle: filename,
    UTI: mimeType === 'application/json' ? 'public.json' : 'net.daringfireball.markdown',
  })
}

export async function shareChatAsMarkdown(chat: Chat): Promise<void> {
  await shareFile(`${safeFilename(chat.title)}.md`, chatToMarkdown(chat), 'text/markdown')
}

export async function shareChatAsJson(chat: Chat): Promise<void> {
  const payload = { app: 'marmot', version: EXPORT_VERSION, exportedAt: new Date().toISOString(), chats: [chat] }
  await shareFile(
    `marmot-${safeFilename(chat.title)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  )
}

export async function shareAllChatsAsJson(chats: Chat[]): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10)
  const payload = { app: 'marmot', version: EXPORT_VERSION, exportedAt: new Date().toISOString(), chats }
  await shareFile(
    `marmot-chats-${stamp}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  )
}
