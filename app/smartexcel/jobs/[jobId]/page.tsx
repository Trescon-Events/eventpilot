"use client";

import { useEffect, useRef, useState, use, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft,
  Download,
  Globe,
  Lock,
  Maximize2,
  Minimize2,
  Paperclip,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { JOB_STATUS_LABELS, type JobStatus } from "@/app/lib/smartexcel/lib/job-states";

interface JobData {
  job: {
    id: string;
    title: string;
    status: string;
    visibility: string;
    structuredUnderstanding: unknown;
    createdBy: string;
    updatedAt: string;
  };
  messages: { id: string; role: string; content: string }[];
  activeQuestion: { id: string; options: string[] | null; allowOther: boolean } | null;
  permissions: { canDelete: boolean; canSetVisibility: boolean; canSaveRecipe: boolean };
}

interface PreviewData {
  columns: string[];
  rows: string[][];
  download: { fileName: string; url: string } | null;
}

async function api<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export default function JobWorkspacePage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const [data, setData] = useState<JobData | null>(null);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [otherText, setOtherText] = useState("");
  const [busy, setBusy] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inflightUser, setInflightUser] = useState<string | null>(null);
  const [inflightFile, setInflightFile] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [previewMaximized, setPreviewMaximized] = useState(false);
  const paneContainerRef = useRef<HTMLDivElement>(null);
  const [chatWidthPct, setChatWidthPct] = useState(50);
  const [resizingPane, setResizingPane] = useState(false);
  const [gridPopout, setGridPopout] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  async function reload() {
    const d = await api<JobData>(`/api/smartexcel/jobs/${jobId}`);
    setData(d);
    return d;
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("smartexcel:chatWidthPct");
    if (stored) {
      const n = parseFloat(stored);
      if (Number.isFinite(n) && n >= 20 && n <= 80) setChatWidthPct(n);
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("smartexcel:chatWidthPct", String(chatWidthPct));
    } catch {
      // ignore quota / disabled storage
    }
  }, [chatWidthPct]);

  useEffect(() => {
    if (!resizingPane) return;
    const onMove = (e: MouseEvent) => {
      const c = paneContainerRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setChatWidthPct(Math.max(20, Math.min(80, pct)));
    };
    const onUp = () => setResizingPane(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    const prevSel = document.body.style.userSelect;
    const prevCur = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevSel;
      document.body.style.cursor = prevCur;
    };
  }, [resizingPane]);

  useEffect(() => {
    if (!gridPopout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGridPopout(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [gridPopout]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.max(56, Math.min(ta.scrollHeight, 160)) + "px";
  }, [text]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length, inflightUser, inflightFile, aiThinking]);

  useEffect(() => {
    if (!data) return;
    if (data.job.status !== "sample_running" && data.job.status !== "full_running") return;
    const id = setInterval(() => {
      void reload();
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.job.status]);

  useEffect(() => {
    if (!data) return;
    const s = data.job.status;
    const chatFocused = s === "clarifying" || s === "rework_requested" || s === "draft" || s === "plan_pending";
    if (chatFocused) setPreviewMaximized(false);
  }, [data?.job.status]);

  if (!data) return <div className="p-6 text-sm text-zinc-400">Loading…</div>;
  const { job, messages, activeQuestion, permissions } = data;

  const canRefineFromChat =
    Boolean(job.structuredUnderstanding) &&
    job.status !== "sample_running" &&
    job.status !== "full_running" &&
    !activeQuestion;

  async function handleSend() {
    if (busy) return;
    const note = text.trim();
    const filePayload = file;
    if (!filePayload && !note) return;
    setBusy(true);
    setError(null);

    if (note) setInflightUser(note);
    if (filePayload) setInflightFile(filePayload.name);
    setText("");
    setFile(null);
    const willCallAi = (note.length > 0 && !filePayload && canRefineFromChat) || !!filePayload;
    setAiThinking(willCallAi);

    try {
      if (note) {
        await api(`/api/smartexcel/jobs/${job.id}/message`, { content: note });
        if (!filePayload && canRefineFromChat) {
          await api(`/api/smartexcel/jobs/${job.id}/clarify/refine`, {});
        }
      }
      if (filePayload) {
        const { artifactId, uploadUrl } = await api<{ artifactId: string; uploadUrl: string }>(
          `/api/smartexcel/jobs/${job.id}/upload/request`,
          { fileName: filePayload.name, mimeType: filePayload.type || undefined, sizeBytes: filePayload.size },
        );
        const put = await fetch(uploadUrl, { method: "PUT", body: filePayload });
        if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
        await api(`/api/smartexcel/jobs/${job.id}/upload/confirm`, { artifactId });
        await api(`/api/smartexcel/jobs/${job.id}/clarify/start`, {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      await reload();
      setInflightUser(null);
      setInflightFile(null);
      setAiThinking(false);
      setBusy(false);
    }
  }

  async function submitAnswer(answer: string, isOther: boolean) {
    const trimmed = answer.trim();
    if (!activeQuestion || !trimmed) return;
    setAnswering(true);
    setError(null);
    setInflightUser(trimmed);
    setAiThinking(true);
    setOtherText("");
    try {
      await api(`/api/smartexcel/jobs/${job.id}/clarify/answer`, {
        questionId: activeQuestion.id,
        answer: trimmed,
        isOther,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      await reload();
      setInflightUser(null);
      setAiThinking(false);
      setAnswering(false);
    }
  }

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      await reload();
      setBusy(false);
    }
  }

  const canRunSample =
    Boolean(job.structuredUnderstanding) &&
    !activeQuestion &&
    job.status !== "sample_running" &&
    job.status !== "full_running";
  const canRunFull = job.status === "sample_pending";

  async function handleDelete() {
    if (!window.confirm("Delete this job? It can be restored within 30 days.")) return;
    await runAction(async () => {
      await api(`/api/smartexcel/jobs/${job.id}/delete`, {});
      router.push("/smartexcel/jobs");
    });
  }

  async function saveTitle() {
    const next = titleDraft.trim();
    if (!next || next === job.title) {
      setEditingTitle(false);
      setTitleDraft(job.title);
      return;
    }
    setEditingTitle(false);
    try {
      await api(`/api/smartexcel/jobs/${job.id}/rename`, { title: next });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename job.");
      setTitleDraft(job.title);
    }
  }

  async function handleSaveRecipe() {
    setBusy(true);
    setError(null);
    try {
      const { recipeId } = await api<{ recipeId: string }>(`/api/smartexcel/jobs/${job.id}/save-recipe`, {});
      router.push(`/smartexcel/recipes/${recipeId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-6 py-3">
        <Link href="/smartexcel/jobs" className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft size={18} />
        </Link>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveTitle();
              } else if (e.key === "Escape") {
                setEditingTitle(false);
                setTitleDraft(job.title);
              }
            }}
            className="rounded-md border border-indigo-500/50 bg-zinc-900 px-2 py-1 text-base font-semibold text-zinc-100 outline-none focus:border-indigo-500"
          />
        ) : (
          <h1
            className="cursor-text rounded px-1 font-semibold text-zinc-100 hover:bg-zinc-800"
            title="Click to rename"
            onClick={() => {
              setTitleDraft(job.title);
              setEditingTitle(true);
            }}
          >
            {job.title}
          </h1>
        )}
        <StatusPill status={job.status as JobStatus} />

        <div className="ml-auto flex items-center gap-2">
          {permissions.canSetVisibility && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction(() =>
                  api(`/api/smartexcel/jobs/${job.id}/visibility`, {
                    visibility: job.visibility === "workspace" ? "restricted" : "workspace",
                  }),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-900 disabled:opacity-50"
              title="Toggle who can see this job"
            >
              {job.visibility === "workspace" ? (
                <>
                  <Globe size={13} /> Workspace
                </>
              ) : (
                <>
                  <Lock size={13} /> Restricted
                </>
              )}
            </button>
          )}
          {permissions.canDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDelete()}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
              title="Delete job"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>

      <div ref={paneContainerRef} className="flex flex-1 overflow-hidden">
        <section
          style={previewMaximized ? undefined : { width: `${chatWidthPct}%` }}
          className={
            previewMaximized
              ? "hidden"
              : "flex min-h-0 min-w-0 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900"
          }
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
        >
          <div ref={messagesRef} className="flex-1 space-y-3 overflow-auto p-5 min-h-0">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[80%] whitespace-pre-wrap rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
                    : "max-w-[85%] rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                }
              >
                {m.role === "user" ? m.content : <Markdown text={m.content} />}
              </div>
            ))}
            {inflightFile && (
              <div className="max-w-[85%] rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Paperclip size={12} /> Uploading <code className="font-mono">{inflightFile}</code>…
                </span>
              </div>
            )}
            {inflightUser && (
              <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">
                {inflightUser}
              </div>
            )}
            {aiThinking && (
              <div className="max-w-[60%] rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:240ms]" />
                  <span className="ml-1 text-xs">Thinking…</span>
                </span>
              </div>
            )}
          </div>
          {activeQuestion && (
            <div className="border-t border-zinc-800/60 bg-indigo-500/10 p-3">
              <p className="mb-2 text-xs font-medium text-zinc-400">Choose an answer:</p>
              <div className="flex flex-wrap gap-2">
                {(activeQuestion.options ?? []).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={answering}
                    onClick={() => void submitAnswer(opt, false)}
                    className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:border-indigo-500/60 hover:text-indigo-300 disabled:opacity-50"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {activeQuestion.allowOther && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitAnswer(otherText, true);
                      }
                    }}
                    placeholder="Other…"
                    disabled={answering}
                    className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none"
                  />
                  <button
                    type="button"
                    disabled={answering || !otherText.trim()}
                    onClick={() => void submitAnswer(otherText, true)}
                    className="text-indigo-400 disabled:text-zinc-300"
                    aria-label="Submit answer"
                  >
                    <Send size={16} />
                  </button>
                </div>
              )}
            </div>
          )}

          {canRunSample && (
            <div className="flex items-center justify-between gap-3 border-t border-zinc-800/60 bg-indigo-500/10 px-3 py-2">
              <span className="text-xs text-indigo-300">
                Ready when you are — chat to refine, then run a sample to preview.
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction(() => api(`/api/smartexcel/jobs/${job.id}/sample`, {}))}
                className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy ? "Running…" : "Run sample"}
              </button>
            </div>
          )}

          <div className="border-t border-zinc-800/60 p-3">
            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
            {file && (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300">
                <Paperclip size={13} />
                <span className="flex-1 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-zinc-400 hover:text-zinc-200"
                  aria-label="Remove file"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-3 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3.5 py-2.5 focus-within:border-indigo-500/60">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-zinc-400 hover:text-zinc-200"
                title="Attach a file"
              >
                <Paperclip size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                placeholder="Describe what you need, or drop a file… (Shift+Enter for newline)"
                className="flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-400 outline-none"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={busy || (!file && !text.trim())}
                className="text-indigo-400 disabled:text-zinc-300"
                aria-label="Send"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </section>

        {!previewMaximized && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setResizingPane(true);
            }}
            onDoubleClick={() => setChatWidthPct(50)}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat / preview panes (double-click to reset)"
            className="w-1.5 shrink-0 cursor-col-resize bg-zinc-800 transition-colors hover:bg-indigo-500/60 active:bg-indigo-500"
          />
        )}

        {gridPopout && (
          <div className="fixed inset-0 z-50 flex flex-col bg-zinc-900 p-6">
            <div className="flex shrink-0 items-center justify-between gap-4 pb-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">{job.title}</h2>
                <p className="text-xs text-zinc-400">
                  {JOB_STATUS_LABELS[job.status as JobStatus]} · full-window preview
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGridPopout(false)}
                aria-label="Close full-window preview"
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ResultGrid jobId={job.id} refreshKey={String(job.updatedAt)} />
            </div>
          </div>
        )}

        <ResultsPane
          jobId={job.id}
          status={job.status as JobStatus}
          updatedAt={String(job.updatedAt)}
          canSaveRecipe={permissions.canSaveRecipe}
          canRunSample={canRunSample}
          canRunFull={canRunFull}
          busy={busy}
          maximized={previewMaximized}
          onToggleMaximize={() => setPreviewMaximized((m) => !m)}
          onOpenPopout={() => setGridPopout(true)}
          onRunSample={() => void runAction(() => api(`/api/smartexcel/jobs/${job.id}/sample`, {}))}
          onRunFull={() => void runAction(() => api(`/api/smartexcel/jobs/${job.id}/full`, {}))}
          onSaveRecipe={() => void handleSaveRecipe()}
        />
      </div>
    </div>
  );
}

function ResultsPane({
  jobId,
  status,
  updatedAt,
  canSaveRecipe,
  canRunSample,
  canRunFull,
  busy,
  maximized,
  onToggleMaximize,
  onOpenPopout,
  onRunSample,
  onRunFull,
  onSaveRecipe,
}: {
  jobId: string;
  status: JobStatus;
  updatedAt: string;
  canSaveRecipe: boolean;
  canRunSample: boolean;
  canRunFull: boolean;
  busy: boolean;
  maximized: boolean;
  onToggleMaximize: () => void;
  onOpenPopout: () => void;
  onRunSample: () => void;
  onRunFull: () => void;
  onSaveRecipe: () => void;
}) {
  const showGrid = status === "sample_pending" || status === "full_running" || status === "completed";

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-900">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-2">
        <span className="text-sm font-medium text-zinc-100">Results &amp; preview</span>
        <StatusPill status={status} />
        <div className="ml-auto flex items-center gap-2">
          {canRunSample && (
            <button
              type="button"
              disabled={busy}
              onClick={onRunSample}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:border-zinc-600 hover:bg-zinc-700 disabled:opacity-50"
            >
              {busy && status !== "sample_pending" && status !== "completed"
                ? "Running…"
                : status === "sample_pending" || status === "completed"
                  ? "Re-run sample"
                  : "Run sample"}
            </button>
          )}
          {canRunFull && (
            <button
              type="button"
              disabled={busy}
              onClick={onRunFull}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Working…" : "Run full job"}
            </button>
          )}
          {status === "completed" && canSaveRecipe && (
            <button
              type="button"
              disabled={busy}
              onClick={onSaveRecipe}
              className="rounded-md border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50"
            >
              Save as recipe
            </button>
          )}
          <button
            type="button"
            onClick={onToggleMaximize}
            title={maximized ? "Restore split (show chat)" : "Maximize preview (hide chat)"}
            className="rounded-md p-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label={maximized ? "Restore split" : "Maximize preview"}
          >
            {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {showGrid ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
          <ResultGrid jobId={jobId} refreshKey={updatedAt} onOpenPopout={onOpenPopout} />
        </div>
      ) : status === "sample_running" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 text-sm text-zinc-300">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Running a sample… the preview will appear here.
            </span>
          </div>
        </div>
      ) : status === "failed" ? (
        <div className="flex-1 space-y-4 overflow-auto p-4">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            This job failed. Check the messages on the left for details, then refine and try again.
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="max-w-sm text-sm text-zinc-300">
            <p className="font-medium text-zinc-100">No results yet</p>
            <p className="mt-1 text-zinc-400">
              Upload a file and chat through what you need. The sample preview will appear here.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: JobStatus }) {
  const styles: Record<string, string> = {
    sample_running: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    full_running: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    sample_pending: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    failed: "bg-red-500/15 text-red-300 border-red-500/30",
    clarifying: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    draft: "bg-zinc-800 text-zinc-300 border-zinc-700",
    plan_pending: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    rework_requested: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    deleted: "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  const cls = styles[status] ?? "bg-zinc-800 text-zinc-300 border-zinc-700";
  const dot =
    status === "sample_running" || status === "full_running"
      ? "bg-amber-400 animate-pulse"
      : status === "sample_pending" || status === "completed"
        ? "bg-emerald-400"
        : status === "failed"
          ? "bg-red-400"
          : "bg-indigo-400";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}

const COL_WIDTH = 176;

function ResultGrid({
  jobId,
  refreshKey,
  onOpenPopout,
}: {
  jobId: string;
  refreshKey: string;
  onOpenPopout?: () => void;
}) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<PreviewData>(`/api/smartexcel/jobs/${jobId}/preview`)
      .then((d) => active && setData(d))
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [jobId, refreshKey]);

  const rows = data?.rows ?? [];
  const columns = data?.columns ?? [];
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  });

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-400">
        Loading preview…
      </div>
    );
  }
  if (!columns.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900 text-sm text-zinc-400">
        No preview available yet.
      </div>
    );
  }

  const totalWidth = columns.length * COL_WIDTH;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/60 px-4 py-2.5">
        <p className="truncate text-sm font-medium text-zinc-100">
          Preview · {rows.length} rows × {columns.length} columns
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {onOpenPopout && (
            <button
              type="button"
              onClick={onOpenPopout}
              title="Open in full window"
              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
            >
              <Maximize2 size={12} /> Full window
            </button>
          )}
          {data?.download && (
            <a
              href={data.download.url}
              download={data.download.fileName}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700"
            >
              <Download size={13} /> Download
            </a>
          )}
        </div>
      </div>
      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
        <div style={{ width: totalWidth }}>
          <div className="sticky top-0 z-10 flex bg-zinc-900">
            {columns.map((c) => (
              <div
                key={c}
                style={{ width: COL_WIDTH }}
                className="shrink-0 truncate border-b border-r border-zinc-800 px-3 py-2 text-left text-xs font-medium text-zinc-400"
              >
                {c}
              </div>
            ))}
          </div>
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((v) => (
              <div key={v.key} className="absolute left-0 flex" style={{ top: v.start, height: v.size, width: totalWidth }}>
                {columns.map((_, ci) => (
                  <div
                    key={ci}
                    style={{ width: COL_WIDTH }}
                    className="shrink-0 truncate border-b border-r border-zinc-800/60 px-3 py-2 text-sm text-zinc-300"
                  >
                    {rows[v.index]?.[ci] ?? ""}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function inlineMd(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < s.length) {
    const b = s.indexOf("**", i);
    const c = s.indexOf("`", i);
    const choices = [b, c].filter((n) => n >= 0);
    if (choices.length === 0) {
      out.push(s.slice(i));
      break;
    }
    const next = Math.min(...choices);
    if (next > i) out.push(s.slice(i, next));
    if (next === b) {
      const end = s.indexOf("**", next + 2);
      if (end < 0) {
        out.push(s.slice(next));
        break;
      }
      out.push(<strong key={`b${k++}`}>{s.slice(next + 2, end)}</strong>);
      i = end + 2;
    } else {
      const end = s.indexOf("`", next + 1);
      if (end < 0) {
        out.push(s.slice(next));
        break;
      }
      out.push(
        <code key={`c${k++}`} className="rounded bg-zinc-800 px-1 font-mono text-xs">
          {s.slice(next + 1, end)}
        </code>,
      );
      i = end + 1;
    }
  }
  return out;
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let para: string[] = [];
  let listItems: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    blocks.push(
      <p key={`p${blocks.length}`} className="whitespace-pre-wrap">
        {inlineMd(para.join(" "))}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`u${blocks.length}`} className="list-disc space-y-0.5 pl-5">
        {listItems.map((l, i) => (
          <li key={i}>{inlineMd(l)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushPara();
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      flushPara();
      blocks.push(
        <h4 key={`h${blocks.length}`} className="mt-1 font-semibold">
          {inlineMd(line.slice(4))}
        </h4>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      flushPara();
      blocks.push(
        <h3 key={`h${blocks.length}`} className="mt-1 font-semibold">
          {inlineMd(line.slice(3))}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      flushPara();
      blocks.push(
        <h3 key={`h${blocks.length}`} className="mt-1 font-semibold">
          {inlineMd(line.slice(2))}
        </h3>,
      );
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      flushPara();
      listItems.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    para.push(line);
  }
  flushList();
  flushPara();
  return <div className="space-y-2">{blocks}</div>;
}
