import React from 'react'
import IconButton from './IconButton'

/** Props for the chat attachment picker button. */
export interface AttachmentButtonProps {
  disabled?: boolean
  onPick: () => void
}

/** Opens the system document picker from the chat composer. */
export default function AttachmentButton({
  disabled,
  onPick,
}: AttachmentButtonProps) {
  return (
    <IconButton
      accessibilityLabel="Attach a file"
      disabled={disabled}
      hitSlop={8}
      icon="attach"
      onPress={onPick}
      variant="secondary"
    />
  )
}
