'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Link2,
  Loader2,
  RefreshCw,
  Unlink,
} from 'lucide-react';

interface PlaidInstitutionMetadata {
  institution_id?: string | null;
  name?: string | null;
}

interface PlaidLinkMetadata {
  institution?: PlaidInstitutionMetadata | null;
}

interface PlaidLinkError {
  error_code?: string;
  display_message?: string | null;
  error_message?: string | null;
}

interface PlaidHandler {
  open: () => void;
  destroy: () => void;
}

interface PlaidLinkApi {
  create: (config: {
    token: string;
    receivedRedirectUri?: string;
    onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void;
    onExit: (error: PlaidLinkError | null) => void;
  }) => PlaidHandler;
}

declare global {
  interface Window {
    Plaid?: PlaidLinkApi;
  }
}

interface ItemStatus {
  itemId: string;
  institutionName: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastWebhookAt: string | null;
  lastError: string | null;
}

interface PlaidStatus {
  configured: boolean;
  environment: 'sandbox' | 'production';
  missing?: string[];
  items: ItemStatus[];
  snapshotAt: string | null;
  error?: string;
}

interface Props {
  hiddenManualCount: number;
  onSnapshotChanged: () => Promise<void> | void;
}

const LINK_TOKEN_KEY = 'beta-than-nothing:plaid-link-token';

function friendlyTime(value: string | null): string {
  if (!value) return 'Not synced yet';
  return new Date(value).toLocaleString();
}

export default function PlaidConnection({ hiddenManualCount, onSnapshotChanged }: Props) {
  const [status, setStatus] = useState<PlaidStatus | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const [message, setMessage] = useState('');
  const handlerRef = useRef<PlaidHandler | null>(null);
  const snapshotCallbackRef = useRef(onSnapshotChanged);
  const lastSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    snapshotCallbackRef.current = onSnapshotChanged;
  }, [onSnapshotChanged]);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/plaid/status', { cache: 'no-store' });
    const next = await res.json() as PlaidStatus;
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus().then(next => {
      lastSnapshotRef.current = next.snapshotAt;
    }).catch(() => setMessage('Could not read Plaid connection status.'));

    if (window.Plaid) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-plaid-link]');
    const script = existing ?? document.createElement('script');
    const handleLoad = () => setScriptReady(true);
    const handleError = () => setMessage('Plaid Link could not be loaded.');
    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    if (!existing) {
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      script.async = true;
      script.dataset.plaidLink = 'true';
      document.head.appendChild(script);
    }
    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, [loadStatus]);

  const exchangePublicToken = useCallback(async (
    publicToken: string,
    metadata: PlaidLinkMetadata,
  ) => {
    setBusy('connect');
    setMessage('Saving the connection and taking the first holdings snapshot…');
    const res = await fetch('/api/plaid/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicToken,
        institution: {
          institutionId: metadata.institution?.institution_id ?? null,
          name: metadata.institution?.name ?? null,
        },
      }),
    });
    const body = await res.json() as {
      error?: string;
      positionCount?: number;
      errors?: Array<{ message: string }>;
    };
    if (!res.ok) throw new Error(body.error ?? 'Could not save the Plaid connection.');
    localStorage.removeItem(LINK_TOKEN_KEY);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('oauth_state_id');
    window.history.replaceState({}, '', cleanUrl);
    await loadStatus();
    await snapshotCallbackRef.current();
    const institutionName = metadata.institution?.name?.trim() || 'brokerage';
    setMessage(body.errors?.length
      ? `Connected successfully. ${institutionName} is still preparing the first holdings snapshot: ${body.errors[0].message}`
      : `Connected successfully. Saved ${body.positionCount ?? 0} ${institutionName} holdings.`);
    setBusy(null);
  }, [loadStatus]);

  const openLink = useCallback((linkToken: string, receivedRedirectUri?: string) => {
    if (!window.Plaid) throw new Error('Plaid Link is still loading.');
    handlerRef.current?.destroy();
    handlerRef.current = window.Plaid.create({
      token: linkToken,
      ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
      onSuccess: (publicToken, metadata) => {
        void exchangePublicToken(publicToken, metadata).catch(error => {
          setBusy(null);
          setMessage(error instanceof Error ? error.message : 'Could not finish the Plaid connection.');
        });
      },
      onExit: error => {
        setBusy(null);
        if (error) setMessage(error.display_message || error.error_message || error.error_code || 'Plaid Link closed with an error.');
      },
    });
    handlerRef.current.open();
  }, [exchangePublicToken]);

  useEffect(() => {
    if (!scriptReady || !new URL(window.location.href).searchParams.has('oauth_state_id')) return;
    const linkToken = localStorage.getItem(LINK_TOKEN_KEY);
    if (!linkToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage('The Fidelity authorization returned, but the Plaid Link session expired. Start the connection again.');
      return;
    }
    setBusy('connect');
    openLink(linkToken, window.location.href);
  }, [openLink, scriptReady]);

  useEffect(() => {
    const checkForSnapshot = async () => {
      try {
        const next = await loadStatus();
        if (next.snapshotAt && lastSnapshotRef.current && next.snapshotAt !== lastSnapshotRef.current) {
          await snapshotCallbackRef.current();
        }
        lastSnapshotRef.current = next.snapshotAt;
      } catch {
        // Keep the last visible status; the next focus or polling cycle retries.
      }
    };
    const interval = window.setInterval(() => void checkForSnapshot(), 5 * 60 * 1000);
    const handleFocus = () => void checkForSnapshot();
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      handlerRef.current?.destroy();
    };
  }, [loadStatus]);

  async function connect() {
    setBusy('connect');
    setMessage('');
    try {
      const res = await fetch('/api/plaid/link-token', { method: 'POST' });
      const body = await res.json() as { linkToken?: string; error?: string };
      if (!res.ok || !body.linkToken) throw new Error(body.error ?? 'Could not start Plaid Link.');
      localStorage.setItem(LINK_TOKEN_KEY, body.linkToken);
      openLink(body.linkToken);
    } catch (error) {
      setBusy(null);
      setMessage(error instanceof Error ? error.message : 'Could not start Plaid Link.');
    }
  }

  async function syncNow() {
    setBusy('sync');
    setMessage('Checking Plaid for its latest Fidelity snapshot…');
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      const body = await res.json() as { error?: string; errors?: Array<{ message: string }> };
      if (!res.ok) throw new Error(body.error ?? 'Plaid sync failed.');
      await loadStatus();
      await snapshotCallbackRef.current();
      setMessage(body.errors?.length ? body.errors[0].message : 'Holdings snapshot updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Plaid sync failed.');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(item: ItemStatus) {
    if (!window.confirm(`Disconnect ${item.institutionName}? Your historical snapshots will remain, but current ${item.institutionName} holdings will be removed.`)) return;
    setBusy('disconnect');
    setMessage('');
    try {
      const res = await fetch(`/api/plaid/items/${encodeURIComponent(item.itemId)}`, { method: 'DELETE' });
      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not disconnect the brokerage.');
      await loadStatus();
      await snapshotCallbackRef.current();
      setMessage(`${item.institutionName} disconnected.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not disconnect the brokerage.');
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return <div className="h-24 animate-pulse rounded-xl border border-[#e5ddd3] bg-white" />;
  }

  if (!status.configured) {
    return (
      <div className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <h2 className="text-sm font-semibold text-[#2d2218]">Plaid connection needs configuration</h2>
            <p className="mt-1 text-xs text-[#6e5f52]">
              Add {status.missing?.join(', ') || status.error || 'the Plaid server variables'} to the dashboard service, then redeploy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#e5ddd3] bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-[#ede8df] p-2">
            <Landmark className="h-4 w-4 text-blue-500" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#2d2218]">U.S. brokerage connection</h2>
              <span className="rounded border border-[#d4c9bc] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#6e5f52]">
                {status.environment}
              </span>
            </div>
            {status.items.length ? (
              <>
                <p className="mt-1 text-xs text-[#6e5f52]">
                  {status.items.map(item => item.institutionName).join(', ')} · snapshot {friendlyTime(status.snapshotAt)}
                </p>
                {hiddenManualCount > 0 && (
                  <p className="mt-1 text-[11px] text-[#9e9087]">
                    {hiddenManualCount} manual brokerage holding{hiddenManualCount === 1 ? '' : 's'} hidden while the connected account is authoritative.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-xs text-[#6e5f52]">Connect Fidelity to replace manual U.S. holdings with nightly snapshots.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status.items.length > 0 && (
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] px-3 py-1.5 text-xs text-[#4a3d33] hover:bg-[#ede8df] disabled:opacity-50"
            >
              {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync snapshot
            </button>
          )}
          <button
            type="button"
            onClick={() => void connect()}
            disabled={!scriptReady || busy !== null}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy === 'connect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            {status.items.length ? 'Connect another' : 'Connect Fidelity'}
          </button>
        </div>
      </div>

      {status.items.map(item => (
        <div key={item.itemId} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#e5ddd3] pt-3 text-xs">
          <div className="flex items-center gap-2">
            {item.lastError
              ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            <span className="font-medium text-[#4a3d33]">{item.institutionName}</span>
            <span className="text-[#9e9087]">Last fetched {friendlyTime(item.lastSyncedAt)}</span>
          </div>
          <button
            type="button"
            onClick={() => void disconnect(item)}
            disabled={busy !== null}
            className="flex items-center gap-1 text-[#9e9087] hover:text-red-500 disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" /> Disconnect
          </button>
          {item.lastError && <p className="w-full text-[11px] text-amber-600">{item.lastError}</p>}
        </div>
      ))}

      {message && <p className="mt-3 text-xs text-[#6e5f52]">{message}</p>}
    </div>
  );
}
