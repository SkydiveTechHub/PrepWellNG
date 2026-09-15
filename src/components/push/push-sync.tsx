"use client";

import { useEffect } from "react";
import { syncThisDevice } from "@/lib/push-client";

/** Renders nothing. Re-sends this device's subscription once per app load. */
export function PushSync() {
  useEffect(() => {
    void syncThisDevice();
  }, []);
  return null;
}
