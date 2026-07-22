import React from 'react'
import type { ColorValue, StyleProp, ViewStyle } from 'react-native'
import { SymbolView } from 'expo-symbols'
import type { AndroidSymbol, SFSymbol } from 'expo-symbols'
import boldWeight from 'expo-symbols/androidWeights/bold'
import mediumWeight from 'expo-symbols/androidWeights/medium'
import regularWeight from 'expo-symbols/androidWeights/regular'
import semiboldWeight from 'expo-symbols/androidWeights/semiBold'

/** Semantic symbols used by Marmot's chat and attachment controls. */
export type IconName =
  | 'mic'
  | 'calendar'
  | 'attach'
  | 'send'
  | 'stop'
  | 'close'
  | 'file'
  | 'image'
  | 'pdf'
  | 'agent'
  | 'research'
  | 'share'
  | 'check'
  | 'warning'
  | 'thought'
  | 'tool'
  | 'observation'
  | 'subtask'
  | 'summarize'
  | 'keyPoints'
  | 'proofread'
  | 'translate'
  | 'tone'
  | 'reply'
  | 'explain'
  | 'privacy'
  | 'flight'
  | 'companion'
  | 'quickActions'
  | 'models'
  | 'settings'
  | 'plus'
  | 'chevronDown'
  | 'menu'

/** Cross-platform symbol weights supported by the shared icon primitive. */
export type IconWeight = 'regular' | 'medium' | 'semibold' | 'bold'

/** Props for a platform-native semantic icon. */
export interface IconProps {
  name: IconName
  size?: number
  tintColor?: ColorValue
  weight?: IconWeight
  style?: StyleProp<ViewStyle>
}

type CrossPlatformSymbol = {
  ios: SFSymbol
  android: AndroidSymbol
  web: AndroidSymbol
}

const SYMBOLS: Record<IconName, CrossPlatformSymbol> = {
  mic: { ios: 'mic.fill', android: 'mic', web: 'mic' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  attach: { ios: 'paperclip', android: 'attach_file', web: 'attach_file' },
  send: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
  stop: { ios: 'stop.fill', android: 'stop', web: 'stop' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  file: { ios: 'doc', android: 'description', web: 'description' },
  image: { ios: 'photo', android: 'image', web: 'image' },
  pdf: { ios: 'doc.richtext', android: 'picture_as_pdf', web: 'picture_as_pdf' },
  agent: { ios: 'gear', android: 'settings', web: 'settings' },
  research: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  thought: { ios: 'lightbulb', android: 'lightbulb', web: 'lightbulb' },
  tool: { ios: 'gear', android: 'build', web: 'build' },
  observation: { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' },
  subtask: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  summarize: { ios: 'doc.on.doc', android: 'description', web: 'description' },
  keyPoints: { ios: 'list.bullet', android: 'format_list_bulleted', web: 'format_list_bulleted' },
  proofread: { ios: 'pencil', android: 'edit', web: 'edit' },
  translate: { ios: 'globe', android: 'translate', web: 'translate' },
  tone: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  reply: { ios: 'arrow.left', android: 'reply', web: 'reply' },
  explain: { ios: 'questionmark.circle', android: 'help_outline', web: 'help_outline' },
  privacy: { ios: 'checkmark.shield', android: 'privacy_tip', web: 'privacy_tip' },
  flight: { ios: 'airplane', android: 'airplanemode_active', web: 'airplanemode_active' },
  companion: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  quickActions: { ios: 'bolt', android: 'bolt', web: 'bolt' },
  models: { ios: 'cube', android: 'view_in_ar', web: 'view_in_ar' },
  settings: { ios: 'gear', android: 'settings', web: 'settings' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  chevronDown: { ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' },
  menu: { ios: 'line.3.horizontal', android: 'menu', web: 'menu' },
}

const ANDROID_WEIGHTS = {
  regular: regularWeight,
  medium: mediumWeight,
  semibold: semiboldWeight,
  bold: boldWeight,
} satisfies Record<IconWeight, typeof regularWeight>

/** Renders the native SF Symbol or Material Symbol for a semantic icon name. */
export default function Icon({
  name,
  size = 20,
  tintColor,
  weight = 'regular',
  style,
}: IconProps) {
  return (
    <SymbolView
      accessible={false}
      name={SYMBOLS[name]}
      size={size}
      tintColor={tintColor}
      type="monochrome"
      weight={{
        ios: weight,
        android: ANDROID_WEIGHTS[weight],
      }}
      style={style}
    />
  )
}
