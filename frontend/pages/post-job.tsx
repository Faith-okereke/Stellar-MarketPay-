/**
 * pages/post-job.tsx
 */
import WalletConnect from "@/components/WalletConnect";
import PostJobForm from "@/components/PostJobForm";
import Link from "next/link";

interface PostJobProps {
  publicKey: string | null;
  onConnect: (pk: string) => void;
}

export default function PostJob({ publicKey, onConnect }: PostJobProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {!publicKey ? (
        <div>
          <div className="text-center mb-10">
            <h1 className="font-display text-3xl font-bold text-amber-100 mb-3">Post a Job</h1>
            <p className="text-amber-800">Connect your wallet to post a job and lock the budget in escrow</p>
          </div>
          <WalletConnect onConnect={onConnect} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-amber-100 font-medium">Need to draft scope with freelancer first?</p>
              <p className="text-xs text-amber-800">Open a realtime shared document and finalize directly into this form.</p>
            </div>
            <Link href="/scope/new" className="btn-secondary px-4 py-2 text-sm whitespace-nowrap">
              Start Scope Session
            </Link>
          </div>
          <PostJobForm publicKey={publicKey} />
        </div>
      )}
    </div>
  );
}
