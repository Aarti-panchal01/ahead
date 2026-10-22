import { Suspense } from "react";
import PlanView from "@/components/plan/PlanView";

export default function Plan() {
  return (
    <Suspense fallback={<main><p className="note">Loading your plan</p></main>}>
      <PlanView />
    </Suspense>
  );
}
