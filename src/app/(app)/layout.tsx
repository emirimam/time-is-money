import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppProvider } from "@/components/AppProvider";
import { Nav } from "@/components/Nav";
import type { Lookup, Profile, Settings } from "@/lib/types";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center text-sm text-muted">Loading…</div>
      }
    >
      <AuthedApp>{children}</AuthedApp>
    </Suspense>
  );
}

async function AuthedApp({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const [profileRes, settingsRes, buildingsRes, scopesRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("buildings").select("*").order("sort_order").order("name"),
    supabase.from("scopes").select("*").order("sort_order").order("name"),
  ]);

  const profile = profileRes.data as Profile | null;
  if (!profile || !profile.active) {
    return (
      <main className="mx-auto max-w-md p-6 pt-24 text-center">
        <h1 className="text-xl font-semibold">No access</h1>
        <p className="mt-2 text-muted">
          Your account is not active. Ask the admin to enable it.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="btn-secondary">Sign out</button>
        </form>
      </main>
    );
  }

  return (
    <AppProvider
      profile={profile}
      settings={settingsRes.data as Settings}
      buildings={(buildingsRes.data ?? []) as Lookup[]}
      scopes={(scopesRes.data ?? []) as Lookup[]}
    >
      <Nav />
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:pb-12 sm:pt-6">{children}</main>
    </AppProvider>
  );
}
