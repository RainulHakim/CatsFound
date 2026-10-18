"use client";

import { useEffect } from "react";
import { clearDraft } from "@/lib/client/draft";

/** The post went through, so the local draft is no longer needed. */
export function ClearDraft() {
  useEffect(() => {
    void clearDraft();
  }, []);
  return null;
}
