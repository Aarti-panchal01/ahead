import { Suspense } from "react";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import PlanView from "@/components/plan/PlanView";

export default function Plan() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading your plan" />}>
      <PlanView />
    </Suspense>
  );
}
