import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Action = "list" | "set_role" | "remove";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requester }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !requester) return json({ error: "Invalid token" }, 401);

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: isSuper } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", requester.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!isSuper) return json({ error: "Only super admins can manage admins" }, 403);

    const body = await req.json().catch(() => ({}));
    const action: Action = body.action;

    // Load all users once (used for email lookups + display)
    const { data: usersList, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) return json({ error: "Failed to list users" }, 500);
    const usersById = new Map(usersList.users.map((u) => [u.id, u]));
    const usersByEmail = new Map(
      usersList.users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]),
    );

    if (action === "list") {
      const { data: roles, error } = await admin
        .from("user_roles")
        .select("id, user_id, role")
        .in("role", ["admin", "super_admin"]);
      if (error) return json({ error: error.message }, 500);

      const userIds = [...new Set((roles ?? []).map((r) => r.user_id))];
      const { data: profiles } = await admin
        .from("participants")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

      const items = (roles ?? []).map((r) => {
        const u = usersById.get(r.user_id);
        return {
          id: r.id,
          user_id: r.user_id,
          role: r.role,
          email: u?.email ?? null,
          full_name: nameById.get(r.user_id) ?? null,
        };
      });
      return json({ admins: items });
    }

    if (action === "set_role") {
      // Promote or demote (or add fresh). Identify target by email or user_id.
      const { email, user_id, role } = body as {
        email?: string;
        user_id?: string;
        role: "admin" | "super_admin";
      };
      if (!role || !["admin", "super_admin"].includes(role))
        return json({ error: "Invalid role" }, 400);

      let targetId = user_id;
      if (!targetId && email) {
        const u = usersByEmail.get(email.toLowerCase());
        if (!u) return json({ error: "No user found with that email. They must sign up first." }, 404);
        targetId = u.id;
      }
      if (!targetId) return json({ error: "user_id or email required" }, 400);

      // Remove the opposite role if present, then upsert the new one (so role is unique per user)
      const other = role === "admin" ? "super_admin" : "admin";
      await admin.from("user_roles").delete().eq("user_id", targetId).eq("role", other);

      const { error: upsertErr } = await admin
        .from("user_roles")
        .upsert({ user_id: targetId, role }, { onConflict: "user_id,role" });
      if (upsertErr) return json({ error: upsertErr.message }, 500);

      return json({ success: true, user_id: targetId, role });
    }

    if (action === "remove") {
      const { user_id } = body as { user_id: string };
      if (!user_id) return json({ error: "user_id required" }, 400);
      if (user_id === requester.id)
        return json({ error: "You cannot remove your own admin access" }, 400);

      const { error } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .in("role", ["admin", "super_admin"]);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("manage-admins error", e);
    return json({ error: "Internal error" }, 500);
  }
});
