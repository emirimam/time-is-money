"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function inviteUser(
  email: string,
  fullName: string,
  hourlyRate: number,
): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { ok: false, message: "Not signed in" };

  const { data: me } = await supabase.from("profiles").select("role, active").eq("id", uid).single();
  if (me?.role !== "admin" || !me.active) return { ok: false, message: "Only an admin can invite people" };

  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { ok: false, message: "Invalid email" };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(cleanEmail, {
    data: { full_name: fullName.trim() },
    redirectTo: `${origin}/login`,
  });
  if (error) return { ok: false, message: error.message };

  if (data.user && Number.isFinite(hourlyRate)) {
    await admin.from("profiles").update({ hourly_rate: hourlyRate }).eq("id", data.user.id);
  }
  return { ok: true, message: `Invitation sent to ${cleanEmail}` };
}
