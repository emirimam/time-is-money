"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "prompt" | "ios" | "none";

const DISMISS_KEY = "tim:install-dismissed-until";
const SIZED_KEY = "tim:window-sized";
const OPEN_EVENT = "tim:open-install";

// Compact window size for the installed desktop app.
const WINDOW_W = 440;
const WINDOW_H = 800;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** Opens the install dialog from anywhere (e.g. a button in Settings). */
export function openInstallPrompt() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>("none");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    // Installed desktop app: open as a small window the first time.
    // After that the OS/browser remembers whatever size the user picks.
    if (isStandalone()) {
      const desktop = window.matchMedia("(pointer: fine)").matches && window.screen.width > 900;
      try {
        if (desktop && !localStorage.getItem(SIZED_KEY)) {
          window.resizeTo(WINDOW_W, WINDOW_H);
          window.moveTo(
            Math.max(0, window.screen.availWidth - WINDOW_W - 24),
            Math.max(0, Math.round((window.screen.availHeight - WINDOW_H) / 2)),
          );
          localStorage.setItem(SIZED_KEY, "1");
        }
      } catch {
        // resizeTo is not allowed in every context
      }
      return;
    }

    let dismissedUntil = 0;
    try {
      dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    } catch {
      // ignore
    }
    const autoShow = Date.now() > dismissedUntil;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setPlatform("prompt");
      if (autoShow) setTimeout(() => setOpen(true), 1500);
    };
    const onInstalled = () => {
      setOpen(false);
      setDeferred(null);
      setPlatform("none");
    };
    const onOpen = () => setOpen(true);

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(OPEN_EVENT, onOpen);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlatform("ios");
      if (autoShow) timer = setTimeout(() => setOpen(true), 1500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(OPEN_EVENT, onOpen);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 14 * 24 * 60 * 60 * 1000));
    } catch {
      // ignore
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={dismiss}>
      <div
        role="dialog"
        aria-modal
        aria-label="Install Time is Money"
        className="w-full rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-sm sm:rounded-2xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
          <div>
            <h2 className="font-semibold">Install Time is Money</h2>
            <p className="text-sm text-muted">Start and stop the timer in one tap.</p>
          </div>
        </div>

        {platform === "prompt" && (
          <>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li>• Opens in its own small window on Windows and Mac</li>
              <li>• Icon on your home screen or taskbar</li>
              <li>• Same timer on every device, synced live</li>
            </ul>
            <div className="mt-5 flex gap-2">
              <button className="btn-secondary flex-1" onClick={dismiss}>Not now</button>
              <button className="btn-primary flex-1" onClick={install} disabled={!deferred}>Install</button>
            </div>
          </>
        )}

        {platform === "ios" && (
          <>
            <ol className="mt-4 space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">1</span>
                <span>
                  Tap{" "}
                  <svg viewBox="0 0 24 24" className="inline h-5 w-5 align-text-bottom text-accent" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
                    <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                  </svg>{" "}
                  <b>Share</b> in the browser bar
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">2</span>
                <span>Choose <b>Add to Home Screen</b></span>
              </li>
              <li className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">3</span>
                <span>Tap <b>Add</b>, then open the app from your home screen</span>
              </li>
            </ol>
            <button className="btn-primary mt-5 w-full" onClick={dismiss}>Got it</button>
          </>
        )}

        {platform === "none" && (
          <>
            <p className="mt-4 text-sm text-muted">
              Open this page in <b>Chrome</b> or <b>Edge</b> on Windows/Android, or in <b>Safari</b> on iPhone, then use
              the browser&apos;s <b>Install app</b> / <b>Add to Home Screen</b> option.
            </p>
            <button className="btn-primary mt-5 w-full" onClick={() => setOpen(false)}>OK</button>
          </>
        )}
      </div>
    </div>
  );
}
