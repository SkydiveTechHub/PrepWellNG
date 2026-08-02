"use client";

import { useState } from "react";
import { LuCheck, LuSend } from "react-icons/lu";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) setSubmitted(true);
      }}
      className="mt-4"
    >
      <div className="flex items-center gap-2 rounded-xl surface hairline p-1.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          className="w-full min-w-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-white transition-colors hover:bg-primary-hover"
        >
          <LuSend className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Subscribe</span>
        </button>
      </div>
      {submitted ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-success">
          <LuCheck className="h-3.5 w-3.5" />
          You’re in! Study tips and exam updates are on the way.
        </p>
      ) : (
        <p className="mt-2 text-[11px] font-medium ink-faint">
          Weekly study tips + exam updates. No spam, unsubscribe anytime.
        </p>
      )}
    </form>
  );
}
