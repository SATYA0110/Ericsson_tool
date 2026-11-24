import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CommandSpec {
  id: string;
  title: string;
  command: string;
}

const COMMANDS: CommandSpec[] = [
  { id: "alt", title: "Active Alarms", command: "alt" },
  { id: "pst", title: "Plugin Unit State", command: "pst" },
  { id: "mutual", title: "Mutual Configuration (MPA/RU)", command: "mutual" },
  { id: "rru", title: "Radio Unit Status", command: "rru" },
  { id: "ret", title: "RET Antenna Status", command: "ret" },
  { id: "cmlist", title: "Cell Management List", command: "cmlist" },
  { id: "gpsToa", title: "GPS ToA", command: "gpsToa" },
  { id: "sctpAll", title: "SCTP Associations", command: "sctpall" },
  { id: "ethlink", title: "Ethernet Links", command: "ethlink" },
  { id: "cv", title: "Software Version", command: "cv" },
  { id: "cdfm", title: "Centralized MIMO Feature", command: "cdfm" },
  { id: "mr", title: "Measurement Results / Load", command: "mr" },
];

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\r/g, "");
}

function cleanOutput(out: string, command: string): string {
  let s = stripAnsi(out);
  const lines = s.split("\n");
  if (lines.length > 0 && lines[0].includes(command)) lines.shift();
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last.length <= 8 && /[>#~\]]$/.test(last)) {
      lines.pop();
    } else {
      break;
    }
  }
  return lines.join("\n").trim();
}

function countAlarms(altOutput: string): Record<string, number> {
  const summary: Record<string, number> = { critical: 0, major: 0, minor: 0, warning: 0 };
  for (const line of altOutput.split("\n")) {
    const l = line.toLowerCase();
    if (/end of/.test(l)) continue;
    if (/\b1a\b|critical/.test(l)) summary.critical++;
    else if (/\b2a\b|major/.test(l)) summary.major++;
    else if (/\b3a\b|minor/.test(l)) summary.minor++;
    else if (/\b4a\b|warning/.test(l)) summary.warning++;
  }
  return summary;
}

function isPrompt(line: string): boolean {
  const t = line.trimEnd();
  return t.length <= 10 && /[>$~\]]\s*$/.test(t) && t.length > 0;
}

async function runCommandsOverTelnet(
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<Map<string, string>> {
  const conn = await Deno.connect({ hostname: host, port, transport: "tcp" });
  const results = new Map<string, string>();
  const buf = new Uint8Array(65536);
  const dec = new TextDecoder();
  let pending = "";

  const waitFor = async (patterns: string[], timeoutMs: number): Promise<string> => {
    const deadline = Date.now() + timeoutMs;
    let acc = pending;
    pending = "";
    while (Date.now() < deadline) {
      for (const p of patterns) {
        if (acc.trimEnd().endsWith(p)) {
          return acc;
        }
      }
      const remaining = Math.max(1, deadline - Date.now());
      const timer = new Promise<"timeout">((res) => setTimeout(() => res("timeout"), remaining));
      const outcome = await Promise.any([
        conn.read(buf).then((n) => (n === null ? "eof" : "data")),
        timer,
      ]);
      if (outcome === "eof") return acc;
      if (outcome === "timeout") continue;
      const n = await conn.read(buf);
      if (n === null) return acc;
      acc += dec.decode(buf.subarray(0, n));
    }
    return acc;
  };

  try {
    const loginPrompt = await waitFor(AUTH_PROMPTS, 20000);
    if (/password/i.test(loginPrompt.split("\n").pop() || "")) {
      await conn.write(new TextEncoder().encode(password + "\n"));
    } else {
      await conn.write(new TextEncoder().encode(username + "\n"));
      await waitFor(AUTH_PROMPTS, 20000);
      await conn.write(new TextEncoder().encode(password + "\n"));
    }

    await waitFor(["# ", "> "], 30000);
    await conn.write(new TextEncoder().encode("\n"));
    await waitFor(["# ", "> "], 10000);

    for (const cmd of COMMANDS) {
      pending = "";
      await conn.write(new TextEncoder().encode(cmd.command + "\n"));
      const out = await waitFor(["# ", "> "], 60000);
      results.set(cmd.id, cleanOutput(out, cmd.command));
    }
  } finally {
    try {
      conn.close();
    } catch {
      // ignore
    }
  }
  return results;
}

async function runCommandsOverSsh(
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<Map<string, string>> {
  const { Client } = await import("npm:ssh2@1.16.0");
  const results = new Map<string, string>();

  await new Promise<void>((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error("SSH connection timed out after 30s"));
    }, 30000);

    conn
      .on("ready", () => {
        clearTimeout(timeout);
        conn.shell({ term: "xterm" }, (err, stream) => {
          if (err) {
            conn.end();
            reject(new Error(`SSH shell error: ${err.message}`));
            return;
          }
          const dec = new TextDecoder();
          const queue: CommandSpec[] = [...COMMANDS];
          let collected = "";
          let active: CommandSpec | null = null;
          let timer: ReturnType<typeof setTimeout> | null = null;

          const finish = (spec: CommandSpec, output: string) => {
            results.set(spec.id, cleanOutput(output, spec.command));
          };

          const sendNext = () => {
            const next = queue.shift();
            if (!next) {
              clearInterval(checkInterval);
              stream.close();
              conn.end();
              resolve();
              return;
            }
            active = next;
            collected = "";
            stream.write(next.command + "\n");
            timer = setTimeout(() => {
              if (active === next) {
                finish(next, collected);
                sendNext();
              }
            }, 45000);
          };

          const checkInterval = setInterval(() => {
            const lines = collected.split("\n");
            const last = lines[lines.length - 1] || "";
            if (active && isPrompt(last) && collected.length > 0) {
              const spec = active;
              active = null;
              if (timer) clearTimeout(timer);
              finish(spec, collected);
              sendNext();
            }
          }, 300);

          let boot = "";
          const bootWait = setInterval(() => {
            const lines = boot.split("\n");
            const last = lines[lines.length - 1] || "";
            if (isPrompt(last)) {
              clearInterval(bootWait);
              boot = "";
              sendNext();
            }
          }, 300);
          setTimeout(() => {
            if (queue.length === COMMANDS.length && !active) {
              clearInterval(bootWait);
              sendNext();
            }
          }, 5000);

          stream.on("data", (d: Uint8Array) => {
            const chunk = dec.decode(d);
            if (active) collected += chunk;
            else boot += chunk;
          });
        });
      })
      .on("error", (e: Error) => {
        clearTimeout(timeout);
        reject(new Error(`SSH error: ${e.message}`));
      })
      .connect({ host, port, username, password, readyTimeout: 30000 });
  });

  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const host = String(body.host || "").trim();
    const port = Number(body.port) || (body.protocol === "telnet" ? 23 : 22);
    const protocol = body.protocol === "telnet" ? "telnet" : "ssh";
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const siteName = String(body.siteName || "").trim() || host;
    const engineer = String(body.engineer || "").trim() || null;

    if (!host || !username || !password) {
      return new Response(JSON.stringify({ error: "Host, username and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let results: Map<string, string>;
    try {
      results = protocol === "telnet"
        ? await runCommandsOverTelnet(host, port, username, password)
        : await runCommandsOverSsh(host, port, username, password);
    } catch (connErr) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );
      await supabase.from("bbu_reports").insert({
        site_name: siteName,
        host,
        protocol,
        username,
        engineer,
        status: "failed",
        error: connErr instanceof Error ? connErr.message : "Connection failed",
      });
      return new Response(
        JSON.stringify({
          error: connErr instanceof Error ? connErr.message : "Could not connect to the BBU",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resultsArray = COMMANDS.map((c) => ({
      id: c.id,
      title: c.title,
      command: c.command,
      output: results.get(c.id) ?? "(no output received)",
    }));

    const succeeded = resultsArray.filter((r) => r.output !== "(no output received)").length;
    const status = succeeded === COMMANDS.length ? "success" : succeeded > 0 ? "partial" : "failed";

    const altResult = resultsArray.find((r) => r.id === "alt");
    const alarmSummary = altResult && altResult.output !== "(no output received)"
      ? countAlarms(altResult.output)
      : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );
    const { data: saved, error: saveErr } = await supabase
      .from("bbu_reports")
      .insert({
        site_name: siteName,
        host,
        protocol,
        username,
        engineer,
        status,
        results: resultsArray,
        alarm_summary: alarmSummary,
      })
      .select()
      .single();

    if (saveErr || !saved) {
      return new Response(JSON.stringify({ error: "Collected results but could not save report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ report: saved }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
