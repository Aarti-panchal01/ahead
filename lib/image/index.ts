// Public API of the image lab. The pure core works on raw pixels in Node and the browser; browser.ts wraps it with
// MediaPipe and data URLs (nothing in it runs at import time).

export {
  BACKGROUND,
  FALLBACK_ACCENT,
  MIN_CONTRAST,
  accentFromHair,
  contrastRatio,
  deltaE2000,
  hexToLab,
  hexToRgb,
  isHex,
  labToHex,
  labToRgb,
  relativeLuminance,
  rgbToHex,
  rgbToLab,
  type Lab,
} from "./colour";
export { resize, resizeMask, type RawImage, type RawImageOut, type Point } from "./raw";
export {
  BROW_LEFT,
  BROW_RIGHT,
  CHEEK_LEFT,
  CHEEK_RIGHT,
  CHIN,
  FACE_LEFT,
  FACE_OVAL,
  FACE_RIGHT,
  INTEGRITY_REGIONS,
  NOSE_BRIDGE,
  NOSE_BRIDGE_UPPER,
  faceWidth,
  hasFace,
  skinSamplePoints,
  toPixels,
  type Landmarks,
} from "./landmarks";
export {
  INTEGRITY_THRESHOLD,
  PLAIN,
  HAIR_SHADOW,
  hairShadedRegions,
  innerFaceMask,
  integrityCheck,
  measureSkin,
  restoreInnerFace,
  type HairMasks,
  type IntegrityCoreReport,
  type IntegrityOptions,
} from "./integrity";
export { compositeFeature, compositeFeatureDetailed, type FeatureComposite } from "./composite";
export { HAIR_CLASS, browDefault, hairMaskFromCategories, sampleColours } from "./sample";
export {
  MEDIAPIPE_VERSION,
  MEDIAPIPE_WASM_BASE,
  MODEL_BASE,
  checkRender,
  closeModels,
  compositeFeatureInBrowser,
  getModels,
  loadPixels,
  readFace,
  sampleColoursInBrowser,
  toDataUrl,
  type AssetPaths,
  type FaceRead,
  type ImageSource,
} from "./browser";
