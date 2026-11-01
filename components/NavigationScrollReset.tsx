"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect } from "react";

function ResetOnNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams.toString()}`;

  useLayoutEffect(() => {
    // Preserve intentional deep links such as /capture#samples.
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [locationKey]);

  return null;
}

/** Keep every App Router page transition immediate and anchored at the top. */
export default function NavigationScrollReset() {
  return (
    <Suspense fallback={null}>
      <ResetOnNavigation />
    </Suspense>
  );
}
