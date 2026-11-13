"use client";

import { useEffect, useRef } from "react";
import { useApp } from "./AppProvider";

/**
 * Calls `reload` whenever time entries change (from any device) and when the
 * app comes back to the foreground — phones often drop the websocket while asleep.
 * Pass `userId` to listen to one person, or null to listen to everything visible (admin).
 */
export function useEntriesRealtime(userId: string | null, reload: () => void) {
  const { supabase } = useApp();
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    const channel = supabase
      .channel(`entries-${userId ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          ...(userId ? { filter: `user_id=eq.${userId}` } : {}),
        },
        () => reloadRef.current(),
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") reloadRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);
}
