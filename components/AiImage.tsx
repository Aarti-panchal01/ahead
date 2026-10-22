// Every persona and catalogue image goes through this component, so the "AI-generated" label is always visible.
// Visible Gemini marks were cropped for layout; this label is the disclosure (Google's SynthID stays in the file).
//
// Performance (Lighthouse mobile): local persona, catalogue and landing images have 320 and 640 px copies made by
// scripts/resize-images.mjs, offered through srcset so a phone downloads a fraction of the bytes. Only the first
// visible hero image of a screen is `priority` (eager, fetchpriority high); everything else is lazy and async.
import recordings from "@/lib/client/resized-recordings.json";
import styles from "./AiImage.module.css";

/** Show only a square of the image (x, y, size in the file's pixels), e.g. a hair crop for the match card. */
export interface AiCrop {
  x: number;
  y: number;
  size: number;
  naturalWidth: number;
}

interface Props {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  crop?: AiCrop;
  /** The one hero image a screen shows first: loaded eagerly at high priority. */
  priority?: boolean;
  /** The rendered width, for srcset. Defaults to the full column width. */
  sizes?: string;
}

/** Folders with 320 and 640 px copies (scripts/resize-images.mjs). */
const RESIZED = /^\/(personas|catalogue|landing)\/([A-Za-z0-9_]+)\.jpg$/;
/** Sample recordings served full size by /api/fixtures (the integrity check reads those); display copies in /rec. */
const FIXTURE = /^\/api\/fixtures\/([A-Za-z0-9_]+)$/;
const RECORDINGS = new Set<string>(recordings);
/**
 * A full-width card on a phone. Slightly under the true width (by the card padding) so a 412 px phone at 1.75x
 * picks the 640 px copy instead of the full file; the difference is a few percent and not visible.
 */
export const COLUMN = "(max-width: 34rem) calc(100vw - 48px), 32rem";

export function srcSetFor(src: string, naturalWidth = 821): string | undefined {
  const f = FIXTURE.exec(src);
  if (f) return RECORDINGS.has(f[1]) ? `/rec/320/${f[1]}.jpg 320w, /rec/640/${f[1]}.jpg 640w, ${src} ${naturalWidth}w` : undefined;
  const m = RESIZED.exec(src);
  if (!m) return undefined;
  const [, dir, name] = m;
  return `/${dir}/320/${name}.jpg 320w, /${dir}/640/${name}.jpg 640w, ${src} ${naturalWidth}w`;
}

export default function AiImage({ src, alt, width, height, className, crop, priority, sizes }: Props) {
  const style = crop
    ? { width: `${(crop.naturalWidth / crop.size) * 100}%`, left: `${(-crop.x / crop.size) * 100}%`, top: `${(-crop.y / crop.size) * 100}%` }
    : undefined;
  // A crop shows a small part of the file magnified, so it needs the full-size original.
  const srcSet = crop ? undefined : srcSetFor(src, width ?? 821);
  return (
    <figure className={`${styles.frame} ${crop ? styles.crop : ""} ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local JPGs with their own 320/640 copies */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes ?? COLUMN : undefined}
        alt={alt}
        width={width}
        height={height}
        className={styles.img}
        style={style}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "auto" : "async"}
        fetchPriority={priority ? "high" : undefined}
      />
      <figcaption className={styles.label}>AI-generated</figcaption>
    </figure>
  );
}
