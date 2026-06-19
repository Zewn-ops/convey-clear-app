"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile (invisible-friendly CAPTCHA) bound to Supabase Auth.
// Renders ONLY when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so the app keeps
// working before the key is provisioned. When set, it yields a token that the
// auth forms pass to Supabase as options.captchaToken (enable in Supabase →
// Auth → Bot & Abuse Protection with the matching Turnstile secret).

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    }
  ) => string;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// True when a Turnstile site key is configured — auth forms use this to gate
// their submit button (no token yet => button disabled) instead of letting the
// raw Supabase "no captcha_token found" error fire after a click.
export const TURNSTILE_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Replace Supabase's unbranded captcha error with a friendly, on-brand message.
export function friendlyAuthError(message: string): string {
  if (/captcha/i.test(message)) {
    return "Please complete the “Verify you are human” check, then try again.";
  }
  return message;
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function Turnstile({ onVerify }: { onVerify: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !ref.current) return;

    const render = () => {
      if (!window.turnstile || !ref.current || ref.current.childElementCount > 0) return;
      window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: "light",
        callback: (token: string) => onVerify(token),
        "error-callback": () => onVerify(null),
        "expired-callback": () => onVerify(null),
      });
    };

    if (window.turnstile) {
      render();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]`
    );
    if (existing) {
      existing.addEventListener("load", render);
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = render;
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="flex justify-center" />;
}
