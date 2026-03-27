/**
* pages/jobs/index.tsx
* Browse all open jobs with category filtering.
*/
import JobCard, { JobCardSkeleton } from "@/components/JobCard";
import { fetchJobs } from "@/lib/api";
import { JOB_CATEGORIES } from "@/utils/format";
import type { Job } from "@/utils/types";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const category = (router.query.category as string) || "";
  const status = (router.query.status as string) || "open";
  const pageFromQuery = Math.max(1, Number(router.query.page) || 1);

  useEffect(() => {
    if (!router.isReady) return;

    let isCancelled = false;

    async function loadJobs() {
      setLoading(true);
      setError(null);

      try {
        let cursor: string | undefined;
        let loadedNextCursor: string | null = null;
        let pagesLoaded = 0;
        let allJobs: Job[] = [];

        for (let page = 1; page <= pageFromQuery; page += 1) {
          const result = await fetchJobs({
            category: category || undefined,
            status: status || undefined,
            limit: 20,
            cursor,
          });

          const seenIds = new Set(allJobs.map((job) => job.id));
          const uniqueNewJobs = result.jobs.filter((job) => !seenIds.has(job.id));
          allJobs = allJobs.concat(uniqueNewJobs);
          loadedNextCursor = result.nextCursor;
          pagesLoaded = page;

          if (!result.nextCursor) break;
          cursor = result.nextCursor;
        }

        if (!isCancelled) {
          setJobs(allJobs);
          setNextCursor(loadedNextCursor);
          setCurrentPage(pagesLoaded);
        }
      } catch (_) {
        if (!isCancelled) setError("Could not load jobs.");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    loadJobs();

    return () => { isCancelled = true; };
  }, [category, status, pageFromQuery, router.isReady]);

  const filtered = search.trim()
    ? jobs.filter((j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.description.toLowerCase().includes(search.toLowerCase()) ||
      j.skills.some((s) => s.toLowerCase().includes(search.toLowerCase()))
    )
    : jobs;

  const setFilter = (key: string, val: string) => {
    router.push(
      { pathname: "/jobs", query: { ...router.query, [key]: val || undefined, page: undefined } },
      undefined,
      { shallow: true }
    );
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const result = await fetchJobs({
        category: category || undefined,
        status: status || undefined,
        limit: 20,
        cursor: nextCursor,
      });

      setJobs((prev) => {
        const seenIds = new Set(prev.map((job) => job.id));
        const uniqueNewJobs = result.jobs.filter((job) => !seenIds.has(job.id));
        return prev.concat(uniqueNewJobs);
      });
      setNextCursor(result.nextCursor);

      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      router.push(
        { pathname: "/jobs", query: { ...router.query, page: String(nextPage) } },
        undefined,
        { shallow: true }
      );
    } catch (_) {
      setError("Could not load more jobs.");
    } finally {
      setLoadingMore(false);
    }
  };

  const setBudgetRange = (min: string, max: string) => {
    router.push({
      pathname: "/jobs",
      query: { ...router.query, minBudget: min || undefined, maxBudget: max || undefined }
    }, undefined, { shallow: true });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-amber-100 mb-1">Browse Jobs</h1>
          <p className="text-amber-800 text-sm">{loading ? "Loading..." : `${filtered.length} job${filtered.length !== 1 ? "s" : ""} found`}</p>
        </div>
        <Link href="/post-job" className="btn-primary text-sm py-2.5 px-5 flex-shrink-0">+ Post a Job</Link>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-800" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, skill, or keyword..."
          className="input-field pl-10"
        />
      </div>

      <div className="flex gap-6">
        {/* Sidebar filters */}
        <aside className="hidden lg:block w-52 flex-shrink-0 space-y-6">
          {/* Status */}
          <div>
            <p className="label">Status</p>
            <div className="space-y-1">
              {["open", "in_progress", "completed", ""].map((s) => (
                <button key={s}
                  onClick={() => setFilter("status", s)}
                  className={clsx(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors font-body",
                    status === s ? "bg-market-500/15 text-market-300 font-medium" : "text-amber-700 hover:text-amber-400 hover:bg-market-500/8"
                  )}>
                  {s === "" ? "All" : s === "open" ? "Open" : s === "in_progress" ? "In Progress" : "Completed"}
                </button>
              ))}
            </div>
          </div>

          {/* Budget Range */}
          <div className="pt-2">
            <p className="label mb-2">Budget (XLM)</p>
            <div className="flex gap-2 items-center mb-3">
              <input
                type="number" placeholder="Min" value={minBudget}
                onChange={(e) => setFilter("minBudget", e.target.value)}
                className="w-full bg-market-900/40 border border-amber-900/30 rounded px-2 py-1 text-xs text-amber-100 placeholder:text-amber-900/50"
              />
              <span className="text-amber-900 text-[10px] font-bold">TO</span>
              <input
                type="number" placeholder="Max" value={maxBudget}
                onChange={(e) => setFilter("maxBudget", e.target.value)}
                className="w-full bg-market-900/40 border border-amber-900/30 rounded px-2 py-1 text-xs text-amber-100 placeholder:text-amber-900/50"
              />
            </div>

            {/* Presets */}
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <button
                onClick={() => setBudgetRange("", "100")}
                className="text-[10px] py-1.5 rounded bg-market-500/5 border border-amber-900/20 text-amber-800 hover:border-amber-700/50 transition-colors"
              >
                &lt; 100
              </button>
              <button
                onClick={() => setBudgetRange("100", "500")}
                className="text-[10px] py-1.5 rounded bg-market-500/5 border border-amber-900/20 text-amber-800 hover:border-amber-700/50 transition-colors"
              >
                100-500
              </button>
              <button
                onClick={() => setBudgetRange("500", "")}
                className="text-[10px] py-1.5 rounded bg-market-500/5 border border-amber-900/20 text-amber-800 hover:border-amber-700/50 transition-colors"
              >
                500+
              </button>
              {(minBudget || maxBudget) && (
                <button
                  onClick={() => setBudgetRange("", "")}
                  className="text-[10px] py-1.5 rounded bg-market-900/40 border border-market-500/30 text-market-400 hover:text-market-300 font-bold"
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>

          {/* Category */}
          <div>
            <p className="label">Category</p>
            <div className="space-y-1">
              <button onClick={() => setFilter("category", "")}
                className={clsx("w-full text-left px-3 py-2 rounded-lg text-sm transition-colors font-body",
                  !category ? "bg-market-500/15 text-market-300 font-medium" : "text-amber-700 hover:text-amber-400 hover:bg-market-500/8")}>
                All Categories
              </button>
              {JOB_CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => setFilter("category", cat)}
                  className={clsx("w-full text-left px-3 py-2 rounded-lg text-sm transition-colors font-body",
                    category === cat ? "bg-market-500/15 text-market-300 font-medium" : "text-amber-700 hover:text-amber-400 hover:bg-market-500/8")}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Job grid */}
        <div className="flex-1">
          {loading ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <JobCardSkeleton key={`job-skeleton-${i}`} />
              ))}
            </div>
          ) : error ? (
            <div className="card text-center py-12">
              <p className="text-red-400 mb-3">{error}</p>
              <button onClick={() => window.location.reload()} className="btn-secondary text-sm">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card text-center py-16">
              <p className="font-display text-xl text-amber-100 mb-2">No jobs found</p>
              <p className="text-amber-800 text-sm mb-6">Try adjusting your filters or search term</p>
              <Link href="/post-job" className="btn-primary text-sm">Post the first job →</Link>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                {filtered.map((job) => <JobCard key={job.id} job={job} />)}
              </div>

              {nextCursor && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="btn-secondary text-sm min-w-40 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loadingMore && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                    {loadingMore ? "Loading..." : "Load more jobs"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 109 9" />
    </svg>
  );
}
