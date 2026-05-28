"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getPublicKey } from "@stellar/freighter-api";
import { createEscrowOnChain } from "@/lib/stellar";
import { saveDraft, deleteDraft } from "@/lib/api";

const DRAFT_STORAGE_KEY = "marketpay_post_job_draft";
const AUTOSAVE_INTERVAL_MS = 30_000;

interface JobFormData {
  title: string;
  description: string;
  budgetXlm: number;
  skills: string;
  deadline: string;
}

type Step = "idle" | "posting" | "escrow" | "complete" | "error";

interface StepState {
  current: Step;
  txHash?: string;
  jobId?: string;
  errorMessage?: string;
}

interface PostJobFormProps {
  publicKey: string;
  initialCategory?: string;
  suggestedFreelancer?: string;
}

const STEPS = [
  { id: "posting", label: "Posting Job" },
  { id: "escrow", label: "Locking Escrow" },
  { id: "complete", label: "Complete" },
] as const;

function StepIndex(step: Step): number {
  if (step === "posting") return 0;
  if (step === "escrow") return 1;
  if (step === "complete") return 2;
  return -1;
}

function ProgressBar({ step }: { step: Step }) {
  const active = StepIndex(step);
  const isError = step === "error";

  return (
    <div className="w-full my-6">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 z-0" />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-indigo-500 z-0 transition-all duration-700"
          style={{
            width: active < 0 ? "0%" : active === 0 ? "0%" : active === 1 ? "50%" : "100%",
          }}
        />

        {STEPS.map((s, i) => {
          const done = active > i;
          const current = active === i;
          const errored = isError && current;

          return (
            <div key={s.id} className="flex flex-col items-center gap-2 z-10">
              <div
                className={[
                  "w-9 h-9 rounded-full flex items-center justify-center border-2 text-sm font-bold transition-all duration-500",
                  done
                    ? "bg-indigo-500 border-indigo-500 text-white"
                    : current && !errored
                    ? "bg-white border-indigo-500 text-indigo-600 animate-pulse"
                    : errored
                    ? "bg-red-500 border-red-500 text-white"
                    : "bg-white border-gray-300 text-gray-400",
                ].join(" ")}
              >
                {done ? "✓" : errored ? "✕" : i + 1}
              </div>
              <span
                className={[
                  "text-xs font-medium whitespace-nowrap",
                  done ? "text-indigo-600" : current && !errored ? "text-indigo-500" : errored ? "text-red-500" : "text-gray-400",
                ].join(" ")}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function loadLocalDraft(): JobFormData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as JobFormData;
  } catch {
    return null;
  }
}

function hasFormContent(form: JobFormData): boolean {
  return Boolean(
    form.title.trim() ||
      form.description.trim() ||
      form.skills.trim() ||
      form.deadline ||
      form.budgetXlm !== 50
  );
}

const defaultForm: JobFormData = {
  title: "",
  description: "",
  budgetXlm: 50,
  skills: "",
  deadline: "",
};

export default function PostJobForm({ publicKey, initialCategory = "" }: PostJobFormProps) {
  const [form, setForm] = useState<JobFormData>(defaultForm);
  const [stepState, setStepState] = useState<StepState>({ current: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<JobFormData | null>(null);
  const [serverDraftId, setServerDraftId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const formRef = useRef(form);
  formRef.current = form;

  const isInProgress = stepState.current === "posting" || stepState.current === "escrow";

  useEffect(() => {
    const local = loadLocalDraft();
    if (local && hasFormContent(local)) {
      setPendingDraft(local);
      setShowDraftBanner(true);
    }
  }, []);

  const persistDraft = useCallback(async () => {
    const current = formRef.current;
    if (!hasFormContent(current)) return;

    if (typeof window !== "undefined") {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(current));
    }

    try {
      const skills = current.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const saved = await saveDraft({
        id: serverDraftId || undefined,
        title: current.title,
        description: current.description,
        budget: current.budgetXlm,
        category: initialCategory || "general",
        skills,
        deadline: current.deadline || undefined,
      });
      if (saved?.id) setServerDraftId(saved.id);
      setLastSavedAt(new Date());
    } catch {
      setLastSavedAt(new Date());
    }
  }, [serverDraftId, initialCategory]);

  useEffect(() => {
    if (isInProgress || stepState.current === "complete") return;

    const interval = setInterval(() => {
      persistDraft();
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isInProgress, stepState.current, persistDraft]);

  const clearDraft = useCallback(async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
    if (serverDraftId) {
      try {
        await deleteDraft(serverDraftId);
      } catch {
        // ignore
      }
      setServerDraftId(null);
    }
  }, [serverDraftId]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "budgetXlm" ? Number(value) : value,
    }));
  }

  function handleRestoreDraft() {
    if (pendingDraft) {
      setForm(pendingDraft);
    }
    setShowDraftBanner(false);
    setPendingDraft(null);
  }

  function handleDiscardDraft() {
    const toDiscard = pendingDraft || form;
    if (hasFormContent(toDiscard) && !window.confirm("Discard your unsaved draft? This cannot be undone.")) {
      return;
    }
    void clearDraft();
    setForm(defaultForm);
    setShowDraftBanner(false);
    setPendingDraft(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setStepState({ current: "posting" });

    let jobId: string | undefined;

    try {
      const createRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          budgetXlm: form.budgetXlm,
          skills: form.skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          deadline: form.deadline,
          clientAddress: publicKey,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err?.message ?? err?.error ?? "Failed to create job");
      }

      const body = await createRes.json();
      const job = body.job ?? body.data;
      jobId = job.id as string;

      setStepState({ current: "escrow", jobId });

      const { publicKey: clientPublicKey } = await getPublicKey();

      const { txHash } = await createEscrowOnChain({
        clientPublicKey,
        jobId,
        budgetXlm: form.budgetXlm,
      });

      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractTxHash: txHash }),
      });

      await clearDraft();
      setStepState({ current: "complete", jobId, txHash });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";

      if (jobId) {
        try {
          await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
        } catch {
          // best-effort rollback
        }
      }

      setStepState({
        current: "error",
        jobId,
        errorMessage: message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setStepState({ current: "idle" });
    setForm(defaultForm);
  }

  if (stepState.current === "complete") {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
        <ProgressBar step="complete" />
        <h2 className="text-2xl font-bold text-gray-900">Job Posted!</h2>
        <p className="text-gray-500 text-sm">
          Your budget of <span className="font-semibold text-indigo-600">{form.budgetXlm} XLM</span> has been locked in escrow.
        </p>
        {stepState.txHash && (
          <p className="text-xs font-mono text-gray-600 break-all">{stepState.txHash}</p>
        )}
        <button type="button" onClick={handleReset} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm">
          Post Another Job
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-lg p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Post a Job</h1>
      <p className="text-gray-500 text-sm mb-6">
        Your XLM budget will be locked in a Soroban escrow contract on-chain.
      </p>

      {showDraftBanner && pendingDraft && (
        <div className="mb-5 rounded-xl border border-market-500/30 bg-market-500/8 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-200">You have an unsaved draft.</p>
          <div className="flex gap-2">
            <button type="button" onClick={handleRestoreDraft} className="text-sm font-semibold text-market-400 hover:text-market-300">
              Restore
            </button>
            <button type="button" onClick={handleDiscardDraft} className="text-sm text-amber-800 hover:text-amber-600">
              Discard
            </button>
          </div>
        </div>
      )}

      {lastSavedAt && !showDraftBanner && (
        <p className="text-xs text-gray-400 mb-4">Draft auto-saved at {lastSavedAt.toLocaleTimeString()}</p>
      )}

      {isInProgress && <ProgressBar step={stepState.current} />}

      {stepState.current === "error" && (
        <div className="mb-5 rounded-xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-semibold text-red-700">Something went wrong</p>
          <p className="text-xs text-red-600">{stepState.errorMessage}</p>
          <button type="button" onClick={() => setStepState({ current: "idle" })} className="mt-2 text-xs text-red-600 underline">
            Dismiss and retry
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
          <input
            name="title"
            value={form.title}
            onChange={handleChange}
            required
            disabled={isInProgress}
            placeholder="e.g. Build a Soroban DEX interface"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            required
            rows={4}
            disabled={isInProgress}
            placeholder="Describe the work, deliverables, and any context..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm disabled:opacity-60 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Budget (XLM)</label>
          <input
            name="budgetXlm"
            type="number"
            min={1}
            step={1}
            value={form.budgetXlm}
            onChange={handleChange}
            required
            disabled={isInProgress}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Required Skills</label>
          <input
            name="skills"
            value={form.skills}
            onChange={handleChange}
            disabled={isInProgress}
            placeholder="Rust, Soroban, TypeScript (comma-separated)"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
          <input
            name="deadline"
            type="date"
            value={form.deadline}
            onChange={handleChange}
            disabled={isInProgress}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={isInProgress}
          className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {stepState.current === "posting"
            ? "Posting job…"
            : stepState.current === "escrow"
            ? "Waiting for Freighter signature…"
            : `Post Job & Lock ${form.budgetXlm} XLM Escrow`}
        </button>
      </form>
    </div>
  );
}
