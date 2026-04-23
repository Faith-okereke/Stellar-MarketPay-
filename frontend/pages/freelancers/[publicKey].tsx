/**
 * pages/freelancers/[publicKey].tsx
 * Public freelancer profile (read-only, from GET /api/profiles/:publicKey).
 */
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import FreelancerTierBadge from "@/components/FreelancerTierBadge";
import { fetchPublicProfile } from "@/lib/api";
import { formatXLM, shortenAddress } from "@/utils/format";
import { accountUrl, isValidStellarAddress } from "@/lib/stellar";
import type { UserProfile } from "@/utils/types";

type LoadState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "ok"; profile: UserProfile };

export default function PublicFreelancerProfilePage() {
  const router = useRouter();
  const rawKey = typeof router.query.publicKey === "string" ? router.query.publicKey : "";

  const [state, setState] = useState<LoadState>({ status: "loading" });

  const titleBase = useMemo(() => {
    if (state.status === "ok" && state.profile.displayName?.trim()) {
      return `${state.profile.displayName.trim()} · MarketPay`;
    }
    if (rawKey && isValidStellarAddress(rawKey)) {
      return `${shortenAddress(rawKey)} · MarketPay`;
    }
    return "Freelancer profile · MarketPay";
  }, [state, rawKey]);

  const metaDescription = useMemo(() => {
    if (state.status === "ok" && state.profile.bio?.trim()) {
      const b = state.profile.bio.trim();
      return b.length > 160 ? `${b.slice(0, 157)}…` : b;
    }
    return "View freelancer profile on Stellar MarketPay.";
  }, [state]);

  useEffect(() => {
    if (!router.isReady) return;

    if (!rawKey) {
      setState({ status: "not_found" });
      return;
    }

    if (!isValidStellarAddress(rawKey)) {
      setState({ status: "invalid" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const profile = await fetchPublicProfile(rawKey);
        if (cancelled) return;
        if (profile === null) setState({ status: "not_found" });
        else setState({ status: "ok", profile });
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Could not load profile.";
        setState({ status: "error", message: msg });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, rawKey]);

  const explorerHref = rawKey && isValidStellarAddress(rawKey) ? accountUrl(rawKey) : "#";

  return (
    <>
      <Head>
        <title>{titleBase}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={titleBase} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="profile" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={titleBase} />
        <meta name="twitter:description" content={metaDescription} />
      </Head>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-fade-in">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-amber-800 hover:text-amber-400 transition-colors mb-6 sm:mb-8"
        >
          ← Back to Jobs
        </Link>

        {state.status === "loading" && (
          <div className="card space-y-4 animate-pulse" aria-busy="true">
            <div className="h-8 bg-market-500/10 rounded w-2/3" />
            <div className="h-4 bg-market-500/8 rounded w-1/2" />
            <div className="h-24 bg-market-500/8 rounded w-full" />
          </div>
        )}

        {state.status === "invalid" && (
          <div className="card border-amber-900/30 text-center py-12 sm:py-16">
            <p className="font-display text-xl text-amber-100 mb-2">Invalid address</p>
            <p className="text-amber-800 text-sm max-w-md mx-auto">
              This URL does not contain a valid Stellar public key. Check the link and try again.
            </p>
          </div>
        )}

        {state.status === "not_found" && (
          <div className="card border-market-500/20 text-center py-12 sm:py-16">
            <p className="font-display text-xl text-amber-100 mb-2">Profile not found</p>
            <p className="text-amber-800 text-sm max-w-md mx-auto mb-6">
              No profile exists for this wallet yet. The freelancer may not have set up their profile.
            </p>
            <Link href="/jobs" className="btn-secondary text-sm inline-flex">
              Browse jobs
            </Link>
          </div>
        )}

        {state.status === "error" && (
          <div className="card border-red-500/20 text-center py-12 sm:py-16">
            <p className="font-display text-xl text-amber-100 mb-2">Something went wrong</p>
            <p className="text-red-400/90 text-sm max-w-md mx-auto">{state.message}</p>
          </div>
        )}

        {state.status === "ok" && (
          <article className="card border-market-500/15 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 mb-6">
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-amber-100 break-words">
                  {state.profile.displayName?.trim() || shortenAddress(state.profile.publicKey)}
                </h1>
                <div className="mt-3">
                  <FreelancerTierBadge tier={state.profile.tier} className="text-sm" />
                </div>
                <p className="text-xs sm:text-sm text-amber-800 mt-2 font-mono break-all">
                  {state.profile.publicKey}
                </p>
              </div>
              <div className="flex flex-col sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                <a
                  href={explorerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-sm w-full sm:w-auto text-center"
                >
                  View on Stellar Expert →
                </a>
              </div>
            </div>

            {state.profile.bio?.trim() ? (
              <div className="mb-6 sm:mb-8">
                <h2 className="label mb-2">Bio</h2>
                <p className="text-amber-700/90 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                  {state.profile.bio.trim()}
                </p>
              </div>
            ) : (
              <p className="text-amber-900/80 text-sm italic mb-6 sm:mb-8">No bio yet.</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="rounded-xl bg-ink-900/50 border border-market-500/10 p-4">
                <p className="label mb-1">Completed jobs</p>
                <p className="font-display text-2xl sm:text-3xl font-bold text-market-400">
                  {state.profile.completedJobs ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-ink-900/50 border border-market-500/10 p-4">
                <p className="label mb-1">Total earned</p>
                <p className="font-display text-2xl sm:text-3xl font-bold text-market-400">
                  {formatXLM(state.profile.totalEarnedXLM ?? "0")}
                </p>
              </div>
              <div className="rounded-xl bg-ink-900/50 border border-market-500/10 p-4">
                <p className="label mb-1">Freelancer tier</p>
                <FreelancerTierBadge tier={state.profile.tier} className="mt-2" />
              </div>
              <div className="rounded-xl bg-ink-900/50 border border-market-500/10 p-4">
                <p className="label mb-1">Average rating</p>
                <p className="font-display text-2xl sm:text-3xl font-bold text-market-400">
                  {state.profile.rating?.toFixed(2) ?? "New"}
                </p>
              </div>
            </div>

            <div>
              <h2 className="label mb-3">Skills</h2>
              {state.profile.skills && state.profile.skills.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {state.profile.skills.map((skill) => (
                    <li
                      key={skill}
                      className="text-sm bg-market-500/10 text-market-300/90 border border-market-500/20 px-3 py-1.5 rounded-full"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-amber-900/80 text-sm italic">No skills listed yet.</p>
              )}
            </div>
          </article>
        )}
      </div>
    </>
  );
}
