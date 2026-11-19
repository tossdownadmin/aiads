"use client";
import { useEffect, useRef, useState } from "react";
import type { MetaAccount } from "../../lib/meta/read";
import type { ClientSeed } from "../../lib/competitors/catalog";
type Props = {
  clients: ClientSeed[];
  version: string | null;
  onClose: () => void;
  onSaved: (clients: ClientSeed[], version: string | null, id: string) => void;
};
export default function ClientPicker({
  clients,
  version,
  onClose,
  onSaved,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    locked = useRef(false);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [query, setQuery] = useState(""),
    [accountId, setAccountId] = useState(""),
    [existingId, setExistingId] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/meta/accounts", { cache: "no-store" }),
        data = await r.json();
      if (!r.ok)
        throw Error(data.error || "The Meta account list is unavailable.");
      setAccounts(
        data.accounts.sort((a: MetaAccount, b: MetaAccount) =>
          a.name.localeCompare(b.name),
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The Meta account list is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    dialog.current?.showModal();
    void load();
  }, []);
  const matches = accounts.filter((a) =>
    (a.name + " " + a.id + " " + a.currency)
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  const linked = clients.find((c) => c.metaAccountId === accountId);
  async function select() {
    if (!accountId || locked.current) return;
    locked.current = true;
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/competitors/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            version,
            existingClientId: existingId || undefined,
          }),
        }),
        data = await r.json();
      if (!r.ok) throw Error(data.error || "The client could not be selected.");
      onSaved(data.clients, data.version, data.selectedClientId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The client could not be selected.",
      );
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="fp-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void select();
        }}
      >
        <header>
          <h3>Select client from Meta</h3>
          <button
            type="button"
            disabled={saving}
            aria-label="Close client selector"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p>
          Choose an ad account available to the connected Meta token. Its name
          and account ID will match audits and reports.
        </p>
        <label className="field">
          Find an account
          <input
            value={query}
            disabled={saving || loading}
            onChange={(e) => {
              setQuery(e.target.value);
              setAccountId("");
              setExistingId("");
            }}
            placeholder="Search by name or account ID"
          />
        </label>
        <label className="field">
          Meta ad account
          <select
            required
            disabled={loading || saving}
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setExistingId("");
            }}
          >
            <option value="">
              {loading ? "Loading Meta accounts…" : "Choose an account"}
            </option>
            {matches.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name} · {a.currency} · {a.id}
                {clients.some((c) => c.metaAccountId === a.id)
                  ? " · Linked"
                  : ""}
              </option>
            ))}
          </select>
          <small>
            {!loading &&
              accounts.length + " accounts available to this connection."}
            {!loading && !matches.length && " No accounts match this search."}
          </small>
        </label>
        {linked ? (
          <p>
            This account is already linked. Open its saved competitor library.
          </p>
        ) : (
          accountId &&
          clients.some((c) => !c.metaAccountId) && (
            <label className="field">
              Keep an existing competitor library <span>(optional)</span>
              <select
                disabled={saving}
                value={existingId}
                onChange={(e) => setExistingId(e.target.value)}
              >
                <option value="">Start a new library for this account</option>
                {clients
                  .filter((c) => !c.metaAccountId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.market ? " · " + c.market : ""}
                    </option>
                  ))}
              </select>
              <small>
                Choose the matching existing client to retain its saved
                competitors, searches and board link.
              </small>
            </label>
          )
        )}
        {error && (
          <div role="alert" className="error">
            {error}
            {!saving && (
              <button
                type="button"
                className="fp-text"
                onClick={() => void load()}
              >
                Reload Meta accounts
              </button>
            )}
            <small>
              If another teammate changed the list, reload the page before
              trying again.
            </small>
          </div>
        )}
        <footer>
          <button
            type="button"
            className="secondary-button"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" disabled={!accountId || loading || saving}>
            {saving
              ? "Saving…"
              : linked
                ? "Open client"
                : "Use selected client"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
