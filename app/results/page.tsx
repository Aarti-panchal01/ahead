import { Suspense } from "react";
import ResultsView from "@/components/results/ResultsView";

// Screen 5. useSearchParams needs a Suspense boundary.
export default function Results() {
  return (
    <Suspense fallback={<main><p className="note">Loading your matches</p></main>}>
      <ResultsView />
    </Suspense>
  );
}
