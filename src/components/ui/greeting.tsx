"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Greeting({ name }: { name?: string }) {
  // Static on the server and during hydration (avoids timezone mismatch);
  // swaps to the learner's local greeting once mounted.
  const greeting = useSyncExternalStore(emptySubscribe, getGreeting, () => "Hello");

  return (
    <span>
      {greeting}
      {name ? `, ${name}` : ""}
    </span>
  );
}
