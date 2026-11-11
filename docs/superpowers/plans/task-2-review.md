# Task 2 review — `artifactOcrImage`

## Scope and evidence

Read-only review of the Task 2 brief/spec and:

- `apps/web/src/artifacts/artifactOcrImage.ts`
- `apps/web/src/artifacts/artifactOcrImage.test.ts`
- Task 1's `apps/web/src/artifacts/artifactOcr.ts`

Per instruction, existing tests were not rerun.

## Compliance

The implementation satisfies the requested Task 2 interfaces and boundaries:

- `prepareArtifactOcrImages(file)` creates an object URL, decodes the image, calls Task 1's `getArtifactOcrRegions(width, height)` directly, and emits the regions in Task 1 order (`title`, `stats`, `set`). It emits one `full` image when Task 1 returns `null` for a non-landscape input.
- Crop dimensions are scaled so each output's longest edge is at least 1600 px when the source crop is smaller, while larger inputs are not downscaled. Crops are encoded through `toBlob(..., 'image/png')`.
- Canvas preprocessing sets grayscale and contrast, then performs per-pixel luminance thresholding at 155 and writes the result back.
- Object URL revocation is in `finally`, including decode/preprocessing errors after URL creation.
- Decode, canvas, and PNG-encoding failures receive readable `Unable to ...` errors; unexpected errors are wrapped as preprocessing errors.
- `formatArtifactOcrText` emits the exact required labels and spacing: `【名称与部位】`, `【属性】`, and `【套装】`.
- No App changes, Tesseract worker calls, upload/persistence behavior, or other Task 3+ scope creep is present in these files.

## Findings

### P2 — contrast is applied twice

`encodeCrop` sets `context.filter = 'grayscale(1) contrast(1.8)'` before drawing, then applies `(luminance - 128) * 1.8 + 128` again to the returned pixels. This is stronger than the brief's single `contrast = 1.8` preprocessing step and may over-crush text/background detail. Use one contrast stage (Canvas filter or the explicit pixel transform) to match the intended parameter exactly.

### Test quality gaps (non-blocking)

The tests cover output mode/order, PNG MIME type, basic preprocessing setup, non-landscape full-image drawing, readable decode errors, URL cleanup, and exact labels. They do not assert:

- exact crop draw rectangles/bounds or all three regions' scale dimensions;
- actual threshold output (including the 155 boundary), grayscale conversion, or the effective contrast result;
- URL cleanup on canvas failure or PNG encoding failure;
- behavior when `getContext` is unavailable or `toBlob` returns `null`.

The existing landscape scale assertion is only against the shared probe canvas's final width, so it would not catch a wrong region-specific crop or scaling calculation.

## Verdict

**Pass with a P2 follow-up.** Task 2 is structurally compliant and appropriately isolated; the required interfaces, Task 1 region reuse, scale floor, PNG output, non-landscape fallback, labelled text, readable errors, and `finally` cleanup are present. Resolve the double-contrast behavior before treating image quality as final, and strengthen the focused tests if this preprocessing is relied upon for production OCR accuracy.
