// Skeleton shown during Suspense / initial load on results and plan screens.
import styles from "./LoadingSkeleton.module.css";

export default function LoadingSkeleton({ label }: { label?: string }) {
  return (
    <main className={styles.wrap} aria-busy="true" aria-label={label ?? "Loading"}>
      <div className={styles.headerRow}>
        <div className={`${styles.bone} ${styles.boneThumb}`} />
        <div className={styles.headerText}>
          <div className={`${styles.bone} ${styles.boneTitle}`} />
          <div className={`${styles.bone} ${styles.boneSubtitle}`} />
        </div>
      </div>
      <div className={styles.tabs}>
        <div className={`${styles.bone} ${styles.boneTab}`} />
        <div className={`${styles.bone} ${styles.boneTab}`} />
      </div>
      <div className={styles.cards}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${styles.bone} ${styles.boneCard}`} />
        ))}
      </div>
    </main>
  );
}
