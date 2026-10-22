// Screen 1: landing. One sample person before, after, and in her full look (wig and brows).
import Link from "next/link";
import AiImage from "@/components/AiImage";
import styles from "./landing.module.css";

const TRIPTYCH = [
  { src: "/personas/P1A.jpg", caption: "Today", alt: "Sample person 1 today, with shoulder-length grey curls" },
  { src: "/personas/P1B.jpg", caption: "Hair gone", alt: "The same person with no hair" },
  { src: "/api/fixtures/hero__P1B_browsB__W01", caption: "Wig and brows", alt: "The same person wearing long grey curls and soft brows, previewed by Ahead" },
];

export default function Landing() {
  return (
    <main className="stack-lg">
      <section aria-label="One person, three looks" className={styles.triptych}>
        {TRIPTYCH.map((t) => (
          <div key={t.caption} className={styles.panel}>
            <AiImage src={t.src} alt={t.alt} width={821} height={1024} />
            <p className={styles.caption}>{t.caption}</p>
          </div>
        ))}
      </section>

      <section className="stack">
        <h1>Try on your next hair, before you lose this one.</h1>
        <p className="lede">
          See wigs and head wraps on your own photo, now and after your hair goes. Every preview is checked so it still
          looks like you.
        </p>
      </section>

      <div className="btn-row">
        <Link href="/start" className="btn btn-primary">Take one photo</Link>
        <Link href="/capture#samples" className="btn btn-quiet">Try with a sample person</Link>
      </div>

      <p className="note">
        Clinical advice is to choose a wig before hair loss and to photograph your current style (MedlinePlus; Oncolink;
        American Cancer Society). The people shown here are AI-generated sample people.
      </p>
    </main>
  );
}
