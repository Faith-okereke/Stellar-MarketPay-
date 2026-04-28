import type { AppProps } from "next/app";
import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Navbar from "@/components/Navbar";
import { connectWallet, getConnectedPublicKey, signTransactionWithWallet } from "@/lib/wallet";
import { fetchAuthChallenge, verifyAuthChallenge, setJwtToken } from "@/lib/api";
import "@/styles/globals.css";
import { ToastProvider } from "@/components/Toast";
import { PriceProvider } from "@/contexts/PriceContext";
import ShortcutsModal from "@/components/ShortcutsModal";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export default function App({ Component, pageProps }: AppProps) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const router = useRouter();

  const isJobDetailPage = router.pathname === "/jobs/[id]";

  const handleToggleShortcutsModal = useCallback(() => {
    setShortcutsModalOpen((current) => !current);
  }, []);

  useKeyboardShortcuts({
    isJobDetailPage,
    onGoToJobs: () => router.push("/jobs"),
    onGoToDashboard: () => router.push("/dashboard"),
    onNewJobPost: () => router.push("/post-job"),
    onToggleShortcutsModal: handleToggleShortcutsModal,
    onJobApply: () => window.dispatchEvent(new CustomEvent("shortcut-apply-job")),
    onJobBackToListing: () => router.push("/jobs"),
    shortcutsModalOpen,
  });

  const handleAuthAndConnect = async (pk: string) => {
    try {
      const challengeTx = await fetchAuthChallenge(pk);
      const { signedXDR, error } = await signTransactionWithWallet(challengeTx);
      if (error || !signedXDR) {
        console.error("Authentication failed:", error);
        return false;
      }
      const token = await verifyAuthChallenge(signedXDR);
      setJwtToken(token);
      return true;
    } catch (e) {
      console.error("Auth error:", e);
      return false;
    }
  };

  useEffect(() => {
    getConnectedPublicKey().then(async (pk) => { 
      if (pk) {
        const authenticated = await handleAuthAndConnect(pk);
        if (authenticated) setPublicKey(pk);
      } 
    });
  }, []);

  const handleConnect = async () => {
    const { publicKey: pk, error } = await connectWallet();
    if (pk) {
      const authenticated = await handleAuthAndConnect(pk);
      if (authenticated) {
        setPublicKey(pk);
      } else {
        alert("Wallet connected, but authentication failed.");
      }
    } else if (error) {
      alert(error);
    }
  };

  return (
    <>
      <ToastProvider>
        <PriceProvider>
        <Head>
          <title>Stellar MarketPay — Decentralised Freelance Marketplace</title>
          <meta name="description" content="Post jobs, hire freelancers, and pay with XLM — secured by Soroban smart contracts." />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="alternate" type="application/rss+xml" title="Stellar MarketPay — Job Listings (RSS)" href="/api/jobs/feed.rss" />
          <link rel="alternate" type="application/atom+xml" title="Stellar MarketPay — Job Listings (Atom)" href="/api/jobs/feed.atom" />
        </Head>
        <div className="min-h-screen bg-ink-900 bg-lines">
          <Navbar publicKey={publicKey} onConnect={handleConnect} onDisconnect={() => setPublicKey(null)} />
          <main>
            <Component {...pageProps} publicKey={publicKey} onConnect={handleConnect} />
          </main>
          <ShortcutsModal
            isOpen={shortcutsModalOpen}
            onClose={() => setShortcutsModalOpen(false)}
            showJobDetailShortcuts={isJobDetailPage}
          />
        </div>
        </PriceProvider>
      </ToastProvider>
    </>
  );
}
