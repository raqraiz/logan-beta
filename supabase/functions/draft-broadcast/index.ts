// Retired. The old broadcast drafting helper belonged to the chat-based Send tab.
// Broadcasts now live in the back office Send screen. This function now does nothing.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "Moved to the new back office" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
