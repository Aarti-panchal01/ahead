// Every persona and catalogue image goes through this component, so the "AI-generated" label is always visible.
// Visible Gemini marks were cropped for layout; this label is the disclosure (Google's SynthID stays in the file).
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
}

export default function AiImage({ src, alt, width, height, className, crop }: Props) {
  const style = crop
    ? { width: `${(crop.naturalWidth / crop.size) * 100}%`, left: `${(-crop.x / crop.size) * 100}%`, top: `${(-crop.y / crop.size) * 100}%` }
    : undefined;
  return (
    <figure className={`${styles.frame} ${crop ? styles.crop : ""} ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local JPGs already sized to 1024 px */}
      <img src={src} alt={alt} width={width} height={height} className={styles.img} style={style} />
      <figcaption className={styles.label}>AI-generated</figcaption>
    </figure>
  );
}
