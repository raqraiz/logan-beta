// Logs failed saves of Logan chat messages (user id, message type, time, error).
// Wrap a service client once; every chat_messages insert/upsert through it is watched.
// Never logs message text, and never changes what the caller sees.
// deno-lint-ignore no-explicit-any
type Any = any;

export async function logMessageFailure(client: Any, userId: string | null | undefined, messageType: string | null | undefined, source: string, error: unknown) {
  try {
    const msg = error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error);
    console.error(`[message-failure] ${source} type=${messageType ?? "?"} user=${userId ?? "?"}: ${msg}`);
    await client.from("message_failures").insert({ user_id: userId ?? null, message_type: messageType ?? null, source, error: msg.slice(0, 500) });
  } catch { /* never throw from logging */ }
}

function watch(b: Any, onError: (e: unknown) => void): Any {
  return new Proxy(b, {
    get(t, p) {
      if (p === "then") {
        return (res: Any, rej: Any) => t.then(
          (out: Any) => { if (out?.error) onError(out.error); return out; },
          (e: unknown) => { onError(e); throw e; },
        ).then(res, rej);
      }
      const v = Reflect.get(t, p, t);
      if (typeof v !== "function") return v;
      return (...a: Any[]) => { const x = v.apply(t, a); return x && typeof x.then === "function" ? watch(x, onError) : x; };
    },
  });
}

export function trackMessageFailures<T>(client: T, source: string): T {
  const c = client as Any;
  return new Proxy(c, {
    get(t, p) {
      const v = Reflect.get(t, p, t);
      if (p !== "from") return typeof v === "function" ? v.bind(t) : v;
      return (table: string) => {
        const qb = t.from(table);
        if (table !== "chat_messages") return qb;
        return new Proxy(qb, {
          get(q, k) {
            const fn = Reflect.get(q, k, q);
            if ((k === "insert" || k === "upsert") && typeof fn === "function") {
              return (rows: Any, ...rest: Any[]) => {
                const first = Array.isArray(rows) ? rows[0] : rows;
                return watch(fn.call(q, rows, ...rest), (e) => void logMessageFailure(t, first?.user_id, first?.message_type ?? "text", source, e));
              };
            }
            return typeof fn === "function" ? fn.bind(q) : fn;
          },
        });
      };
    },
  }) as T;
}
