# Model files

| File | Source | Licence |
|---|---|---|
| face_landmarker.task | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task (MediaPipe Face Landmarker, float16 v1) | Apache License 2.0 (verified 15 Oct 2026 in all three model cards of the bundle, see below) |
| selfie_multiclass_256x256.tflite | https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite (MediaPipe Selfie Multiclass Segmentation) | Apache License 2.0 (verified 15 Oct 2026 in the model card, see below) |

Downloaded 14 Oct 2026 (copied unchanged into Ahead on 22 Oct 2026 from the LookShift project, where the licence check below was done).
Used in the browser through `@mediapipe/tasks-vision` 1.0.1 (`lib/image/browser.ts`); the test fixtures under `test/image/fixtures/` were made with the same two models (Python mediapipe 0.10.35).

## Verification (15 Oct 2026)

Both models are Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). That licence allows use,
modification and redistribution, including in a public open-source repository and commercially, provided the
licence text and any NOTICE are kept with redistributed copies. Nothing found restricts them to non-commercial use.

The licence is stated in each model card PDF, under the heading "LICENSED UNDER" (exact text):

| Model card (PDF) | Covers | Exact text |
|---|---|---|
| https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf | selfie_multiclass_256x256 (author Adel Ahmadyan, Google; model date May 10, 2023) | "LICENSED UNDER Apache License, Version 2.0" |
| https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf | face detector inside face_landmarker.task | "LICENSED UNDER Apache License, Version 2.0" |
| https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf | face mesh (landmarks) inside face_landmarker.task | "LICENSED UNDER Apache License, Version 2.0" |
| https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf | blendshape model inside face_landmarker.task | "LICENSED UNDER Apache License, Version 2.0" |

Where the model cards are linked from (official Google AI Edge pages; the old ai.google.dev/edge/... URLs now
301-redirect here):

- Image segmenter: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter
  (model table, row "SelfieMulticlass (256 x 256)", links the Multiclass Segmentation model card above)
- Face landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
  (model bundle section, links the BlazeFace, Face Mesh V2 and Blendshape V2 model cards above)

The pages themselves do not state a model licence. Their footer covers only the page: "Except as otherwise noted,
the content of this page is licensed under the Creative Commons Attribution 4.0 License, and code samples are
licensed under the Apache 2.0 License." The model licence comes from the model cards.

Use limits from the model cards (they are "out-of-scope" guidance, not licence terms):

- Multiclass segmentation: "not intended for human life-critical decisions and applications that require pixel
  perfect masks"; "Any form of surveillance or identity recognition is explicitly out of scope".
- Face Mesh V2 / Blendshape V2: "not intended for human life-critical decisions"; landmarks "do not provide facial
  recognition or identification".
- BlazeFace: surveillance or identity recognition out of scope; not for faces looking away from the camera or
  further than about 2 m.

Ahead's use (face landmarks to check skin tone and composite brows, hair segmentation to read hair colour) is within scope.

The model files are redistributed in the repo, so the Apache-2.0 licence text sits next to them:
`public/models/LICENSE-APACHE-2.0.txt` (the official text, identical to https://www.apache.org/licenses/LICENSE-2.0.txt,
sha256 cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30). Keep this file and that one with the models.
