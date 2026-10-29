import { Suspense } from "react";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import ResultsView from "@/components/results/ResultsView";

// Screen 5. useSearchParams needs a Suspense boundary.
export default function Results() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading your matches" />}>
      <ResultsView />
    </Suspense>
  );
}
