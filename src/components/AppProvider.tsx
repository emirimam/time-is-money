"use client";

import { createContext, useContext, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lookup, Profile, Settings } from "@/lib/types";

interface AppContextValue {
  supabase: ReturnType<typeof createClient>;
  profile: Profile;
  settings: Settings;
  buildings: Lookup[];
  scopes: Lookup[];
  isAdmin: boolean;
  tz: string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  profile,
  settings,
  buildings,
  scopes,
  children,
}: {
  profile: Profile;
  settings: Settings;
  buildings: Lookup[];
  scopes: Lookup[];
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const value = useMemo(
    () => ({
      supabase,
      profile,
      settings,
      buildings,
      scopes,
      isAdmin: profile.role === "admin",
      tz: settings.timezone,
    }),
    [supabase, profile, settings, buildings, scopes],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
