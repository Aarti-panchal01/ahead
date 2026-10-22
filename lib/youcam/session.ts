// Plain wording for the end-of-session answer.
export function endNote(n: { live: number; deleted: number; skipped: number; failed: number }): string {
  if (n.live === 0) return "We removed this session from our records. Nothing of yours was held at YouCam.";
  const base = "We removed this session from our records";
  if (n.skipped === 0 && n.failed === 0) return `${base} and deleted your photos and renders from YouCam.`;
  const left = n.skipped + n.failed;
  const parts: string[] = [];
  if (n.skipped) parts.push(`${n.skipped} ${n.skipped === 1 ? "render was" : "renders were"} still being made, so ${n.skipped === 1 ? "it was" : "they were"} left for now`);
  if (n.failed) parts.push(`${n.failed} could not be deleted just now`);
  const tail = `YouCam removes ${left === 1 ? "it" : "them"} automatically within 30 days.`;
  return `${base}${n.deleted ? ` and deleted ${n.deleted} from YouCam` : ""}. ${parts.join(", and ")}. ${tail}`;
}
