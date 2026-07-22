# Verifier adequacy

This suite protects the actual distribution wedge rather than just the
existence of a share plugin.

1. A weak suite could pass because `expo-share-intent` is installed while the
   native filters still accept text only, so screenshots never appear in
   Marmot's share sheet.
2. A weak suite could pass because a shared URI is routed to the app but never
   copied into private app storage, leaving the local model with an inaccessible
   provider URI.
3. A weak suite could pass because a vision answer is rendered as prose while
   the user still has no explicit extraction, typed calendar preview, approval,
   and undo path.

The verifier checks both native configuration and the source-level path, then
executes focused normalization tests for shared media.
