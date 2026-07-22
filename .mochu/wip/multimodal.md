# Iteration 8 — multimodal grounding

## Selected gap

`multimodal`: screenshots and receipts are the most shareable remaining local
assistant wedge, but the current catalog is text-only.

## Frozen milestone

Package one honest, device-sized vision path end to end:

1. Curate SmolVLM 256M Q8 plus its matching `mmproj` as a paired model asset.
2. Download, resume, atomically finalize, and delete both files as one model.
3. Initialize and release the projector through `llama.rn`.
4. Send image attachments as local structured media only when the loaded model
   reports vision support; retain the existing text and unsupported fallbacks.
5. Verify with focused tests and an Android DocumentsUI image-grounding run.

## Explicit non-goals

- no cloud/provider fallback;
- no claim that every imported `.gguf` understands images;
- no PDF OCR promise until a real PDF-to-image path is tested;
- no large 4B vision model on the 1.5 GB canonical emulator.

## Runtime gate

The milestone is not shipped until Android evidence shows the paired model and
projector downloaded, a real local image selected, and a correct answer shown
in chat. If the emulator cannot complete that path, keep the code/test work as
progress and record the exact runtime blocker.
