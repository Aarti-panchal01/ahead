// Every persona and catalogue image goes through this component, so the "AI-generated" label is always visible.
// Visible Gemini marks were cropped for layout; this label is the disclosure (Google's SynthID stays in the file).
import styles from "./AiImage.module.css";

interface Props {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
}

export default function AiImage({ src, alt, width, height, className }: Props) {
  return (
    <figure className={`${styles.frame} ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local JPGs already sized to 1024 px */}
      <img src={src} alt={alt} width={width} height={height} className={styles.img} />
      <figcaption className={styles.label}>AI-generated</figcaption>
    </figure>
  );
}
