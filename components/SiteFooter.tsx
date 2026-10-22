import Link from "next/link";
import { DELETION_LINE } from "@/lib/client/copy";
import styles from "./SiteFooter.module.css";

/** On every screen: how we tested YouCam, and what happens to the try-ons. */
export default function SiteFooter() {
  return (
    <footer className={styles.foot}>
      <Link href="/how-we-tested">How we tested this</Link>
      <p>{DELETION_LINE} All people and products shown are AI-generated samples.</p>
    </footer>
  );
}
