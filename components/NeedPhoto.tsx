import Link from "next/link";

/** Shown when a screen needs a photo but the session has none (for example after a refresh: nothing is stored). */
export default function NeedPhoto() {
  return (
    <main className="stack-lg">
      <h1>Choose a photo first</h1>
      <p className="lede">Nothing is saved between visits, so choose your photo again to continue your try-on.</p>
      <Link href="/capture" className="btn btn-primary">Choose a photo</Link>
    </main>
  );
}
