import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Play,
  Radio,
  Trash2,
  Wifi,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { generateReportPdf } from "@/lib/pdf";
import { PREDEFINED_COMMANDS, type BbuReport } from "@/types";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bbu-collector`;

type RunState = "idle" | "running" | "done" | "error";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: BbuReport["status"] }) {
  const map = {
    success: { icon: CheckCircle2, text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
    partial: { icon: AlertTriangle, text: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    failed: { icon: AlertTriangle, text: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  } as const;
  const { icon: Icon, text, bg } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${bg} ${text}`}>
      <Icon size={13} />
      {status}
    </span>
  );
}

export default function App() {
  const [siteName, setSiteName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [protocol, setProtocol] = useState<"ssh" | "telnet">("ssh");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [engineer, setEngineer] = useState("");

  const [runState, setRunState] = useState<RunState>("idle");
  const [runError, setRunError] = useState("");
  const [progressIdx, setProgressIdx] = useState(0);
  const [currentReport, setCurrentReport] = useState<BbuReport | null>(null);

  const [history, setHistory] = useState<BbuReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("bbu_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setHistory(data as BbuReport[]);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const selected = history.find((h) => h.id === selectedId) || currentReport;

  const startCollection = async () => {
    if (!host.trim() || !username.trim() || !password) {
      setRunError("Please fill in the node IP, username and password.");
      setRunState("error");
      return;
    }
    setRunState("running");
    setRunError("");
    setProgressIdx(0);
    setCurrentReport(null);
    setSelectedId(null);

    const total = PREDEFINED_COMMANDS.length;
    const ticker = setInterval(() => {
      setProgressIdx((i) => (i < total - 1 ? i + 1 : i));
    }, 8000);

    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ host, port: Number(port), protocol, username, password, siteName, engineer }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || `Collection failed (${res.status})`);
      }
      setCurrentReport(json.report as BbuReport);
      setRunState("done");
      loadHistory();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Collection failed");
      setRunState("error");
    } finally {
      clearInterval(ticker);
    }
  };

  const deleteReport = async (id: string) => {
    await supabase.from("bbu_reports").delete().eq("id", id);
    if (selectedId === id) setSelectedId(null);
    loadHistory();
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600">
            <Radio size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">BBU Report Tool</h1>
            <p className="text-sm text-slate-400">Automatic Ericsson BBU health check and PDF reporting</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
          {/* Left: connection form */}
          <section>
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                  <Wifi size={16} className="text-sky-600" /> Node connection
                </h2>
              </div>
              <div className="space-y-4 px-5 py-5">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Site name</label>
                  <input
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    placeholder="e.g. SITE001_MAIN"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                <div className="grid grid-cols-[1fr_100px] gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Node OAM IP / host *</label>
                    <input
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="10.0.0.14"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Port</label>
                    <input
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      inputMode="numeric"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Protocol</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["ssh", "telnet"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setProtocol(p);
                          setPort(p === "ssh" ? "22" : "23");
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium uppercase transition-colors ${
                          protocol === p
                            ? "border-sky-600 bg-sky-600 text-white"
                            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Username *</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Password *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Engineer name (for report header)</label>
                  <input
                    value={engineer}
                    onChange={(e) => setEngineer(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <button
                  onClick={startCollection}
                  disabled={runState === "running"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runState === "running" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Connecting and collecting...
                    </>
                  ) : (
                    <>
                      <Play size={16} /> Run health check &amp; build report
                    </>
                  )}
                </button>
                <p className="text-xs leading-relaxed text-slate-500">
                  The tool connects automatically, runs all {PREDEFINED_COMMANDS.length} predefined commands
                  ({PREDEFINED_COMMANDS.map((c) => c.command).join(", ")}), and saves the result so you can download the PDF.
                </p>
              </div>
            </div>

            {/* History */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                  <Clock size={16} className="text-sky-600" /> Report history
                </h2>
              </div>
              <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {historyLoading ? (
                  <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-500">
                    <Loader2 size={14} className="animate-spin" /> Loading...
                  </div>
                ) : history.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500">No reports yet. Run your first health check.</p>
                ) : (
                  history.map((h) => (
                    <div
                      key={h.id}
                      className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                        selectedId === h.id ? "bg-sky-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <button
                        onClick={() => setSelectedId(h.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium text-slate-800">{h.site_name}</p>
                        <p className="text-xs text-slate-500">
                          {h.host} - {formatDateTime(h.created_at)}
                        </p>
                      </button>
                      <StatusBadge status={h.status} />
                      <button
                        onClick={() => generateReportPdf(h)}
                        title="Download PDF"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-sky-700"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        onClick={() => deleteReport(h.id)}
                        title="Delete"
                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Right: progress + report */}
          <section className="space-y-6">
            {runState === "running" && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-sky-800">
                  <Loader2 size={16} className="animate-spin" />
                  Collecting data from {host} — do not close this page
                </div>
                <ol className="space-y-2">
                  {PREDEFINED_COMMANDS.map((c, i) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      {i < progressIdx ? (
                        <CheckCircle2 size={15} className="text-emerald-600" />
                      ) : i === progressIdx ? (
                        <Loader2 size={15} className="animate-spin text-sky-600" />
                      ) : (
                        <span className="inline-block h-[15px] w-[15px] rounded-full border border-slate-300" />
                      )}
                      <code className="rounded bg-white px-1.5 py-0.5 text-xs font-medium text-slate-700">{c.command}</code>
                      <span className="text-slate-600">{c.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {runState === "error" && (
              <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-600" />
                <div>
                  <p className="text-sm font-semibold text-rose-800">Collection failed</p>
                  <p className="mt-1 text-sm text-rose-700">{runError}</p>
                  <p className="mt-2 text-xs text-rose-600">
                    Check the node IP, protocol and credentials. The BBU must be reachable from this app's server on port {port}.
                  </p>
                </div>
              </div>
            )}

            {selected && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                      <FileText size={16} className="text-sky-600" /> {selected.site_name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {selected.host} ({selected.protocol.toUpperCase()}) - collected {formatDateTime(selected.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={selected.status} />
                    <button
                      onClick={() => generateReportPdf(selected)}
                      disabled={selected.status === "failed"}
                      className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download size={16} /> Download PDF
                    </button>
                  </div>
                </div>

                {selected.error && (
                  <div className="border-b border-slate-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">{selected.error}</div>
                )}

                {selected.alarm_summary && (
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <Activity size={14} /> Alarm summary
                    </h3>
                    <div className="grid grid-cols-4 gap-3">
                      {(
                        [
                          ["Critical", selected.alarm_summary.critical, "bg-rose-50 text-rose-700 border-rose-200"],
                          ["Major", selected.alarm_summary.major, "bg-amber-50 text-amber-700 border-amber-200"],
                          ["Minor", selected.alarm_summary.minor, "bg-sky-50 text-sky-700 border-sky-200"],
                          ["Warning", selected.alarm_summary.warning, "bg-slate-50 text-slate-600 border-slate-200"],
                        ] as const
                      ).map(([label, value, cls]) => (
                        <div key={label} className={`rounded-lg border p-3 text-center ${cls}`}>
                          <p className="text-2xl font-bold">{value}</p>
                          <p className="text-xs font-medium">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4 px-5 py-5">
                  {(selected.results || []).map((r) => (
                    <details key={r.id} className="group rounded-lg border border-slate-200">
                      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        <span>{r.title}</span>
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{r.command}</code>
                      </summary>
                      <pre className="max-h-96 overflow-auto border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-800">
                        {r.output}
                      </pre>
                    </details>
                  ))}
                  {(!selected.results || selected.results.length === 0) && (
                    <p className="text-sm text-slate-500">No command output was collected for this run.</p>
                  )}
                </div>
              </div>
            )}

            {!selected && runState !== "running" && runState !== "error" && (
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white/60 text-center">
                <Radio size={36} className="mb-3 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No report selected</p>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  Fill in the node details on the left and run a health check, or pick a past report from the history.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
