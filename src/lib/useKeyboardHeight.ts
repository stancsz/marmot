import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/**
 * Android 16 edge-to-edge overlays the keyboard on the app window and
 * defeats both adjustResize and KeyboardAvoidingView (verified in emulator
 * E2E). Track the keyboard height explicitly and pad content with it.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setHeight(e.endCoordinates?.height ?? 0)
    )
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  return height
}
