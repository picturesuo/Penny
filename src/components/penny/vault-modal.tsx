"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Lock, Trash2, Unlock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createVaultEntry, decryptVaultEntry, summarizeVaultPayload, type VaultContentPayload } from "@/lib/vault";
import { deleteVaultEntry, listVaultEntries, saveVaultEntry, touchVaultEntry } from "@/lib/vault-storage";
import { formatDate } from "@/lib/utils";
import type { VaultEntry, VaultEntryType } from "@/types/thought-map";

export interface VaultDraft {
  entryType: VaultEntryType;
  mapId: string;
  claimId?: string | null;
  sessionId?: string | null;
  title: string;
  description: string;
  payload: VaultContentPayload;
}

export interface VaultModalProps {
  open: boolean;
  userId: string;
  draft: VaultDraft | null;
  onClose: () => void;
  onSaved?: (entry: VaultEntry, map: unknown) => void;
}

export function VaultModal({ open, userId, draft, onClose, onSaved }: VaultModalProps) {
  const [passphrase, setPassphrase] = useState("");
  const [keyHint, setKeyHint] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [decryptedEntry, setDecryptedEntry] = useState<{ entry: VaultEntry; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, startTransition] = useTransition();
  const [unlockPending, setUnlockPending] = useState(false);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  );

  useEffect(() => {
    if (!open) {
      setPassphrase("");
      setKeyHint("");
      setConfirmation("");
      setEntries([]);
      setSelectedEntryId(null);
      setDecryptedEntry(null);
      setError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const localEntries = await listVaultEntries();
        if (!cancelled) {
          setEntries(localEntries);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load vault entries.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function createLocalVaultEntry() {
    if (!draft) {
      return;
    }

    if (confirmation.trim() !== "I understand") {
      setError('Type "I understand" to confirm the vault tradeoff.');
      return;
    }

    if (passphrase.trim().length < 8) {
      setError("Use a passphrase with at least 8 characters.");
      return;
    }

    setError(null);

    const localEntry = await createVaultEntry({
      entryType: draft.entryType,
      payload: draft.payload,
      passphrase,
      keyHint: keyHint.trim().length ? keyHint.trim() : null,
    });

    await saveVaultEntry(localEntry);

    const response = await fetch(`/api/users/${userId}/vault`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mapId: draft.mapId,
        entryId: localEntry.id,
        entryType: localEntry.entryType,
        claimId: draft.claimId ?? null,
        sessionId: draft.sessionId ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error("Vault registration failed.");
    }

    const payload = (await response.json()) as { vaultEntry: VaultEntry; map: unknown };
    setEntries((current) => [localEntry, ...current.filter((entry) => entry.id !== localEntry.id)]);
    onSaved?.(localEntry, payload.map);
  }

  async function unlockEntry(entry: VaultEntry) {
    if (!passphrase.trim()) {
      setError("Enter the passphrase to unlock vault content.");
      return;
    }

    setUnlockPending(true);
    setError(null);

    try {
      const payload = await decryptVaultEntry<unknown>(entry, passphrase);
      await touchVaultEntry(entry.id);
      const refreshedEntries = await listVaultEntries();
      setEntries(refreshedEntries);
      setDecryptedEntry({ entry, payload });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock the vault entry.");
    } finally {
      setUnlockPending(false);
    }
  }

  async function removeEntry(entryId: string) {
    try {
      await deleteVaultEntry(entryId);
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      if (selectedEntryId === entryId) {
        setSelectedEntryId(null);
        setDecryptedEntry(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the vault entry.");
    }
  }

  if (!open) {
    return null;
  }

  const selectedPayload = decryptedEntry && selectedEntry && decryptedEntry.entry.id === selectedEntry.id ? decryptedEntry.payload : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-black/10 bg-[var(--paper)] p-6 shadow-[0_40px_120px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Vault mode</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--ink)]">
              {draft ? "Move sensitive work into device-only storage" : "Unlock or manage vault entries"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Vault content is stored only on this device. If you lose the passphrase or clear your browser, it cannot be recovered.
            </p>
          </div>
          <Button type="button" variant="ghost" className="h-10 w-10 p-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {draft ? (
          <Card className="mt-6 border border-black/8 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Designate as vault</p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">{draft.title}</h3>
              </div>
              <Lock className="size-5 text-[var(--muted-ink)]" />
            </div>

            <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{draft.description}</p>
            <div className="mt-4 rounded-[20px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What will be stored locally</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                {draft.payload.title} · {draft.payload.description}
              </p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Passphrase</span>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Key hint</span>
                <input
                  type="text"
                  value={keyHint}
                  onChange={(event) => setKeyHint(event.target.value)}
                  placeholder="Think: ..."
                  className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Type to confirm</span>
              <input
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder='Type "I understand"'
                className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              />
            </label>

            <div className="mt-4 rounded-[20px] border border-[#d7c06c] bg-[#fff9df] px-4 py-3 text-sm leading-6 text-[#6f5612]">
              Vault content is local-only. Penny will register the vault entry ID on the server for awareness, but the encrypted content never leaves this device.
            </div>

            {error ? <p className="mt-3 text-sm text-[#8b4d1f]">{error}</p> : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                className="gap-2"
                disabled={actionPending}
                onClick={() => {
                  startTransition(() => {
                    void createLocalVaultEntry().catch((err) => {
                      setError(err instanceof Error ? err.message : "Could not create the vault entry.");
                    });
                  });
                }}
              >
                <Lock className="size-4" />
                Move to Vault
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Keep in map
              </Button>
            </div>
          </Card>
        ) : null}

        <Card className="mt-6 border border-black/8 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Vault inventory</p>
              <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">{entries.length} local entries</h3>
            </div>
            <AlertTriangle className="size-5 text-[#8b4d1f]" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
            <div className="space-y-3">
              {entries.length ? (
                entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={[
                      "w-full rounded-[20px] border p-4 text-left transition",
                      selectedEntryId === entry.id ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-black/10 bg-[var(--panel)] text-[var(--ink)]",
                    ].join(" ")}
                    onClick={() => setSelectedEntryId(entry.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{entry.entryType.replaceAll("_", " ")}</p>
                        <p className="text-xs uppercase tracking-[0.16em] opacity-80">Vault entry</p>
                      </div>
                      <Lock className="size-4" />
                    </div>
                    <p className="mt-3 text-xs leading-5 opacity-80">Created {formatDate(entry.createdAt)}</p>
                    <p className="mt-1 text-xs leading-5 opacity-80">Last accessed {formatDate(entry.lastAccessedAt)}</p>
                    <p className="mt-1 text-xs leading-5 opacity-80">{entry.keyHint ?? "No key hint set"}</p>
                  </button>
                ))
              ) : (
                <p className="rounded-[20px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                  No local vault entries yet. Move a claim, map, or session into the vault to start.
                </p>
              )}
            </div>

            <div className="rounded-[24px] bg-[var(--panel)] p-4">
              {selectedEntry ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Selected entry</p>
                    <Badge className="bg-white text-[var(--ink)]">{selectedEntry.entryType.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                    {selectedEntry.keyHint ?? "No key hint set. Use the passphrase to unlock the content."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="gap-2"
                      variant="secondary"
                      disabled={unlockPending}
                      onClick={() => {
                        startTransition(() => {
                          void unlockEntry(selectedEntry);
                        });
                      }}
                    >
                      <Unlock className="size-4" />
                      Unlock
                    </Button>
                    <Button variant="danger" disabled={unlockPending} onClick={() => void removeEntry(selectedEntry.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {selectedPayload ? (
                    <div className="mt-4 rounded-[20px] bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Decrypted content</p>
                      <pre className="mt-3 overflow-x-auto text-xs leading-6 text-[var(--ink)]">
                        {JSON.stringify(selectedPayload, null, 2)}
                      </pre>
                      <p className="mt-3 text-xs leading-5 text-[var(--muted-ink)]">
                        {JSON.stringify(summarizeVaultPayload(selectedPayload as VaultContentPayload), null, 2)}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm leading-6 text-[var(--muted-ink)]">Select an entry to unlock or remove it locally.</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
