"use client";

import { useEffect, useRef, useState } from "react";
import BoardPicker from "./client-board";
import ClientPicker from "./client-picker";
import type { ClientSeed } from "../../lib/competitors/catalog";
import {
  advertiserIds,
  type ConfirmedCompetitor,
  type ForeplayCandidate,
  type Library,
  type ResearchResult,
  type SavedSearch,
} from "../../lib/competitors/library";
import "./library.css";

type SaveCandidate = { brandId?: string; pageId?: string; name?: string };
type Query = {
  mode: "library" | "keywords" | "page";
  competitorIds?: string[];
  searchTerms?: string;
  pageIds?: string[];
  useBoard?: boolean;
  boardAdvertisers?: boolean;
};
const jsonHeaders = { "Content-Type": "application/json" };
const empty: Library = { competitors: [], searches: [] };
const split = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
const website = (value: string) =>
  value.trim()
    ? value.includes("://")
      ? value.trim()
      : "https://" + value.trim()
    : undefined;
async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The request could not be completed.");
  return data;
}
export default function ForeplayLibrary({
  client,
  clients,
  ready,
  onClient,
  onClients,
  onResult,
  onBusy,
  saveCandidate,
  onReset,
}: {
  client: ClientSeed;
  clients: ClientSeed[];
  ready: boolean;
  onClient: (id: string) => void;
  onClients: (clients: ClientSeed[]) => void;
  onResult: (result: ResearchResult, query: string) => void;
  onBusy: (busy: boolean) => void;
  saveCandidate: SaveCandidate | null;
  onReset: () => void;
}) {
  const [library, setLibrary] = useState<Library>(empty),
    [version, setVersion] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState<string | null>(null),
    [catalogLoaded, setCatalogLoaded] = useState(false);
  const [tab, setTab] = useState<"library" | "discover">("library"),
    [kind, setKind] = useState<"domain" | "name" | "keywords" | "page">("name");
  const [query, setQuery] = useState(""),
    [candidates, setCandidates] = useState<ForeplayCandidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]),
    [boardMode, setBoardMode] = useState<"" | "advertisers" | "curated">("");
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [format, setFormat] = useState("ALL"),
    [status, setStatus] = useState("ACTIVE"),
    [platform, setPlatform] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null),
    [lastQuery, setLastQuery] = useState<Query | null>(null);
  const [editing, setEditing] = useState<ConfirmedCompetitor | null>(null),
    [brandsText, setBrandsText] = useState(""),
    [pagesText, setPagesText] = useState("");
  const [confirmed, setConfirmed] = useState(false),
    [searchName, setSearchName] = useState("");
  const [clientPicking, setClientPicking] = useState(false);
  const [clientEdit, setClientEdit] = useState<ClientSeed | null>(null);
  const editor = useRef<HTMLDialogElement>(null),
    clientEditor = useRef<HTMLDialogElement>(null);
  const alive = useRef(true),
    locked = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      onBusy(false);
    };
  }, []);
  async function loadLibrary() {
    try {
      const data = await readResponse(
        await fetch(
          "/api/competitors/selection?clientId=" +
            encodeURIComponent(client.id),
          { cache: "no-store" },
        ),
      );
      if (!alive.current) return;
      setLibrary(data);
      setVersion(data.version);
      setLoaded(true);
      setSelected(
        data.competitors
          .filter((c: ConfirmedCompetitor) => c.reviewed === true)
          .map((c: ConfirmedCompetitor) => c.id),
      );
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "The library is unavailable.",
        );
    }
  }
  async function loadClients() {
    try {
      const data = await readResponse(
        await fetch("/api/competitors/clients", { cache: "no-store" }),
      );
      if (!alive.current) return;
      onClients(data.clients);
      setCatalogVersion(data.version);
      setCatalogLoaded(true);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Client brands are unavailable.",
        );
    }
  }
  useEffect(() => {
    if (ready) {
      void loadLibrary();
      void loadClients();
    }
  }, [ready]);
  useEffect(() => {
    if (editing && !editor.current?.open) editor.current?.showModal();
  }, [editing]);
  useEffect(() => {
    if (clientEdit && !clientEditor.current?.open)
      clientEditor.current?.showModal();
  }, [clientEdit]);
  useEffect(() => {
    if (saveCandidate)
      openEditor({
        id: crypto.randomUUID(),
        name: saveCandidate.name || "",
        domain: "",
        brandIds: saveCandidate.brandId ? [saveCandidate.brandId] : [],
        pageIds: saveCandidate.pageId ? [saveCandidate.pageId] : [],
      });
  }, [saveCandidate]);
  function openEditor(value: ConfirmedCompetitor) {
    setError("");
    setNotice("");
    setEditing({ ...value });
    const ids = advertiserIds(value);
    setBrandsText(ids.brands.join(", "));
    setPagesText(ids.pages.join(", "));
    setConfirmed(value.reviewed === true);
  }
  async function saveLibrary(next: Library) {
    if (!loaded || saving) return false;
    setSaving(true);
    setError("");
    try {
      const data = await readResponse(
        await fetch("/api/competitors/selection", {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify({ ...next, clientId: client.id, version }),
        }),
      );
      if (!alive.current) return false;
      setLibrary(data);
      setVersion(data.version);
      setSelected((current) =>
        current.filter((id) =>
          data.competitors.some(
            (c: ConfirmedCompetitor) => c.id === id && c.reviewed === true,
          ),
        ),
      );
      setNotice("Shared library saved.");
      setResult(null);
      onReset();
      return true;
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Could not save the library.",
        );
      return false;
    } finally {
      if (alive.current) setSaving(false);
    }
  }
  async function saveCompetitor() {
    if (!editing || !confirmed) return;
    const next = {
      ...editing,
      website: website(editing.website || ""),
      brandIds: split(brandsText),
      pageIds: split(pagesText),
      reviewed: true as const,
    };
    const exists = library.competitors.some((c) => c.id === next.id);
    const competitors = exists
      ? library.competitors.map((c) => (c.id === next.id ? next : c))
      : [...library.competitors, next];
    if (await saveLibrary({ ...library, competitors })) {
      setEditing(null);
      setSelected((current) => Array.from(new Set([...current, next.id])));
    }
  }
  async function runSearch(input: Query, after?: string, refresh = false) {
    if (locked.current || !ready) return;
    locked.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    if (!after) {
      setResult(null);
      onReset();
    }
    try {
      const data = await readResponse(
        await fetch("/api/competitors/search", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            source: "foreplay",
            clientId: client.id,
            country: client.country || "US",
            ...input,
            activeStatus: status,
            mediaType: format,
            platform: platform || undefined,
            after,
            refresh,
          }),
        }),
      );
      if (!alive.current) return;
      const merged =
        after && result
          ? {
              ...data,
              ads: Array.from(
                new Map(
                  [...result.ads, ...data.ads].map((ad) => [ad.id, ad]),
                ).values(),
              ),
            }
          : data;
      setResult(merged);
      setLastQuery(input);
      onResult(merged, input.searchTerms || client.name);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      locked.current = false;
      if (alive.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  async function discover() {
    if (!query.trim() || locked.current) return;
    if (kind === "keywords" || kind === "page") {
      await runSearch(
        kind === "page"
          ? { mode: "page", pageIds: [query.trim()] }
          : { mode: "keywords", searchTerms: query.trim() },
      );
      return;
    }
    locked.current = true;
    setBusy(true);
    onBusy(true);
    setCandidates([]);
    setError("");
    setNotice("");
    try {
      const data = await readResponse(
        await fetch("/api/competitors/brands", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(
            kind === "domain"
              ? { domain: query.trim() }
              : { query: query.trim() },
          ),
        }),
      );
      if (alive.current) {
        setCandidates(data.candidates);
        setNotice(
          data.candidates.length
            ? data.candidates.length +
                " advertiser matches · " +
                data.creditCost +
                " lookup credits"
            : "No matching advertisers in the Foreplay index. Try a name, website or Facebook Page ID.",
        );
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      locked.current = false;
      if (alive.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  async function saveSearch() {
    if (!query.trim() || !searchName.trim()) return;
    const search: SavedSearch = {
      id: crypto.randomUUID(),
      name: searchName.trim(),
      query: query.trim(),
    };
    if (
      await saveLibrary({ ...library, searches: [...library.searches, search] })
    )
      setSearchName("");
  }
  async function saveClient() {
    if (!clientEdit || !catalogLoaded) return;
    setSaving(true);
    setError("");
    const normalized = {
      ...clientEdit,
      evidence: website(clientEdit.evidence) || "",
    };
    const next = clients.some((c) => c.id === normalized.id)
      ? clients.map((c) => (c.id === normalized.id ? normalized : c))
      : [...clients, normalized];
    try {
      const data = await readResponse(
        await fetch("/api/competitors/clients", {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify({ clients: next, version: catalogVersion }),
        }),
      );
      if (alive.current) {
        onClients(data.clients);
        setCatalogVersion(data.version);
        setClientEdit(null);
        onClient(normalized.id);
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Client could not be saved.");
    } finally {
      if (alive.current) setSaving(false);
    }
  }
  const libraryQuery: Query = {
    mode: "library",
    competitorIds: selected,
    useBoard: !!boardMode,
    boardAdvertisers: boardMode === "advertisers",
  };
  const canFetch = ready && loaded && (!!boardMode || selected.length > 0);
  const filters = (
    <div className="fp-filters">
      <label className="field">
        Delivery
        <select
          value={status}
          disabled={busy}
          onChange={(e) => {
            setStatus(e.target.value);
            setResult(null);
            onReset();
          }}
        >
          <option value="ACTIVE">Currently active</option>
          <option value="ALL">All available</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </label>
      <label className="field">
        Creative format
        <select
          value={format}
          disabled={busy}
          onChange={(e) => {
            setFormat(e.target.value);
            setResult(null);
            onReset();
          }}
        >
          <option value="ALL">All formats</option>
          <option value="IMAGE">Images</option>
          <option value="VIDEO">Videos</option>
        </select>
      </label>
      <label className="field">
        Platform
        <select
          value={platform}
          disabled={busy}
          onChange={(e) => {
            setPlatform(e.target.value);
            setResult(null);
            onReset();
          }}
        >
          <option value="">All platforms</option>
          <option value="FACEBOOK">Facebook</option>
          <option value="INSTAGRAM">Instagram</option>
          <option value="MESSENGER">Messenger</option>
          <option value="AUDIENCE_NETWORK">Audience Network</option>
        </select>
      </label>
    </div>
  );
  const errorBlock = error && (
    <div role="alert" className="error">
      {error}
      <button
        type="button"
        className="fp-text"
        onClick={() => {
          void loadLibrary();
          void loadClients();
        }}
      >
        Reload shared lists
      </button>
    </div>
  );
  return (
    <div className="fp-workspace">
      <div className="fp-client-bar">
        <label className="field">
          Client brand
          <select
            value={client.id}
            disabled={busy || saving}
            onChange={(e) => onClient(e.target.value)}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.metaAccountId
                  ? " · " + c.metaAccountId
                  : c.market
                    ? " · " + c.market
                    : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={!catalogLoaded || saving}
          onClick={() => {
            setError("");
            setClientEdit({ ...client });
          }}
        >
          Edit client
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!catalogLoaded || saving}
          onClick={() => {
            setError("");
            setClientPicking(true);
          }}
        >
          Select client
        </button>
      </div>
      <nav className="fp-tabs" aria-label="Foreplay workspace">
        <button
          type="button"
          aria-pressed={tab === "library"}
          onClick={() => setTab("library")}
        >
          Saved competitors
        </button>
        <button
          type="button"
          aria-pressed={tab === "discover"}
          onClick={() => setTab("discover")}
        >
          Discover advertisers & ads
        </button>
      </nav>
      {tab === "library" ? (
        <>
          <div className="fp-section-head">
            <div>
              <h3>{client.name} competitors</h3>
              <p>Choose the advertisers to include in this search.</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={
                !loaded || saving || library.competitors.length >= 10 || busy
              }
              onClick={() =>
                openEditor({
                  id: crypto.randomUUID(),
                  name: "",
                  domain: "",
                  brandIds: [],
                  pageIds: [],
                })
              }
            >
              Add competitor
            </button>
          </div>
          {!loaded && <p>Loading the shared library…</p>}
          <div className="fp-library-list">
            {library.competitors.map((c) => {
              const ids = advertiserIds(c);
              return (
                <article className="fp-competitor" key={c.id}>
                  <label className="fp-select">
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      disabled={c.reviewed !== true || busy || saving}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, c.id]
                            : current.filter((id) => id !== c.id),
                        )
                      }
                    />
                    <span className="fp-avatar">{c.name.slice(0, 1)}</span>
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {[
                          c.domain,
                          c.market,
                          ids.pages.length
                            ? ids.pages.length +
                              " Facebook " +
                              (ids.pages.length === 1 ? "Page" : "Pages")
                            : ids.brands.length +
                              " Foreplay " +
                              (ids.brands.length === 1
                                ? "advertiser"
                                : "advertisers"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                      {c.notes && <small>{c.notes}</small>}
                      {c.reviewed !== true && (
                        <small>
                          Review this earlier match before fetching ads.
                        </small>
                      )}
                    </span>
                  </label>
                  <div className="fp-row-actions">
                    <button
                      type="button"
                      className="fp-text"
                      disabled={!ready || busy || c.reviewed !== true}
                      onClick={() =>
                        void runSearch({
                          mode: "library",
                          competitorIds: [c.id],
                        })
                      }
                    >
                      View ads
                    </button>
                    <button
                      type="button"
                      className="fp-text"
                      disabled={saving || busy}
                      onClick={() => openEditor(c)}
                    >
                      {c.reviewed === true ? "Edit" : "Review"}
                    </button>
                    <button
                      type="button"
                      className="fp-text"
                      disabled={saving || busy}
                      onClick={() =>
                        void saveLibrary({
                          ...library,
                          competitors: library.competitors.filter(
                            (row) => row.id !== c.id,
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {loaded && !library.competitors.length && (
            <div className="fp-empty">
              <h4>Add the first competitor</h4>
              <p>
                Find an advertiser by name or website, or add its Facebook Page
                ID.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTab("discover")}
              >
                Find advertisers
              </button>
            </div>
          )}
          {library.competitors.length > 0 && (
            <button
              type="button"
              className="fp-text"
              onClick={() =>
                setSelected(
                  library.competitors
                    .filter((c) => c.reviewed === true)
                    .map((c) => c.id),
                )
              }
            >
              Select all confirmed competitors
            </button>
          )}
          <details className="fp-board">
            <summary>Use a Foreplay board</summary>
            <BoardPicker
              clientId={client.id}
              using={boardMode}
              onUse={(value) => {
                setBoardMode(value);
                setResult(null);
                onReset();
              }}
            />
          </details>
          {filters}
          <div className="fp-fetch">
            <button
              type="button"
              disabled={!canFetch || busy || saving}
              onClick={() => void runSearch(libraryQuery)}
            >
              {busy
                ? "Fetching…"
                : boardMode
                  ? "Fetch board ads"
                  : "Fetch selected ads"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={
                !canFetch || busy || !!boardMode || selected.length !== 1
              }
              onClick={() => void runSearch(libraryQuery, undefined, true)}
            >
              Collect latest ads
            </button>
          </div>
          <p className="fp-cost">
            Up to 20 ads per page · One credit per returned ad. Live collection
            can take about 30 seconds per Page and return partial results.
          </p>
          {library.searches.length > 0 && (
            <section className="fp-saved-searches">
              <h4>Saved product & keyword searches</h4>
              {library.searches.map((s) => (
                <div key={s.id}>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      setTab("discover");
                      setKind("keywords");
                      setQuery(s.query);
                      void runSearch({
                        mode: "keywords",
                        searchTerms: s.query,
                      });
                    }}
                  >
                    {s.name}
                    <small>{s.query}</small>
                  </button>
                  <button
                    type="button"
                    className="fp-text"
                    disabled={saving}
                    aria-label={"Remove saved search " + s.name}
                    onClick={() =>
                      void saveLibrary({
                        ...library,
                        searches: library.searches.filter(
                          (row) => row.id !== s.id,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </section>
          )}
          {client.competitors.length > 0 && (
            <details className="fp-suggestions">
              <summary>Suggested competitors for this client</summary>
              <div>
                {client.competitors.map((c) => (
                  <article key={c.domain}>
                    <strong>{c.name}</strong>
                    <small>{c.domain}</small>
                    <a href={c.evidence} target="_blank" rel="noreferrer">
                      Why included ↗
                    </a>
                    <button
                      type="button"
                      className="fp-text"
                      onClick={() => {
                        setKind("domain");
                        setQuery(c.domain);
                        setTab("discover");
                        setCandidates([]);
                      }}
                    >
                      Look up advertiser
                    </button>
                  </article>
                ))}
              </div>
            </details>
          )}
        </>
      ) : (
        <>
          <div className="fp-section-head">
            <div>
              <h3>Find an advertiser or discover ads</h3>
              <p>
                Review the advertiser identity before saving it to {client.name}
                .
              </p>
            </div>
          </div>
          <form
            className="fp-discover"
            onSubmit={(e) => {
              e.preventDefault();
              void discover();
            }}
          >
            <label className="field">
              Search by
              <select
                value={kind}
                disabled={busy}
                onChange={(e) => {
                  setKind(e.target.value as typeof kind);
                  setCandidates([]);
                  setResult(null);
                  onReset();
                }}
              >
                <option value="name">Advertiser name</option>
                <option value="domain">Website</option>
                <option value="keywords">Product or keyword</option>
                <option value="page">Facebook Page ID</option>
              </select>
            </label>
            <label className="field">
              {kind === "domain"
                ? "Website"
                : kind === "name"
                  ? "Advertiser name"
                  : kind === "page"
                    ? "Numeric Facebook Page ID"
                    : "Product or keyword"}
              <input
                value={query}
                disabled={busy}
                maxLength={kind === "domain" ? 200 : 100}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCandidates([]);
                  setResult(null);
                  onReset();
                }}
                placeholder={
                  kind === "domain"
                    ? "competitor.com"
                    : kind === "name"
                      ? "e.g. CAVA"
                      : kind === "page"
                        ? "e.g. 123456789"
                        : "e.g. shawarma catering"
                }
              />
            </label>
            <button type="submit" disabled={!ready || !query.trim() || busy}>
              {busy
                ? "Searching…"
                : kind === "name" || kind === "domain"
                  ? "Find advertisers"
                  : "Find ads"}
            </button>
          </form>
          {kind === "name" || kind === "domain" ? (
            <p className="fp-cost">
              One Foreplay credit per advertiser lookup.
            </p>
          ) : (
            filters
          )}
          <div className="fp-candidates">
            {candidates.map((c) => (
              <article key={c.id}>
                <div>
                  <h4>{c.name}</h4>
                  <p>{c.domain || c.website || "Website unlisted"}</p>
                  {c.activeAdsCount !== undefined && (
                    <small>{c.activeAdsCount} active ads indexed</small>
                  )}
                  {c.pageUrl && (
                    <a href={c.pageUrl} target="_blank" rel="noreferrer">
                      Check advertiser ↗
                    </a>
                  )}
                  <small>
                    Foreplay ID · {c.id}
                    {c.pageIds.length ? " · Page " + c.pageIds.join(", ") : ""}
                  </small>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!loaded || saving}
                  onClick={() => openEditor({ ...c, id: crypto.randomUUID() })}
                >
                  Review & save
                </button>
              </article>
            ))}
          </div>
          {kind === "page" && /^\d{3,30}$/.test(query.trim()) && (
            <div className="fp-inline">
              <a
                href={"https://www.facebook.com/" + query.trim()}
                target="_blank"
                rel="noreferrer"
              >
                Check this Facebook Page ↗
              </a>
              <button
                type="button"
                className="secondary-button"
                disabled={!loaded || saving}
                onClick={() =>
                  openEditor({
                    id: crypto.randomUUID(),
                    name: "",
                    domain: "",
                    brandIds: [],
                    pageIds: [query.trim()],
                  })
                }
              >
                Save this Page as a competitor
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !ready}
                onClick={() =>
                  void runSearch(
                    { mode: "page", pageIds: [query.trim()] },
                    undefined,
                    true,
                  )
                }
              >
                Try live collection
              </button>
            </div>
          )}
          {kind === "keywords" && query.trim() && (
            <div className="fp-save-search">
              <label className="field">
                Save this search as
                <input
                  value={searchName}
                  maxLength={100}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="e.g. Local catering offers"
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                disabled={!loaded || saving || !searchName.trim()}
                onClick={() => void saveSearch()}
              >
                Save search
              </button>
            </div>
          )}
          <p className="fp-cost">
            Ad searches use up to 20 credits per page. Keywords search
            Foreplay’s indexed ad names and descriptions.
          </p>
        </>
      )}
      {result && (
        <div className="fp-search-status">
          <span>
            Fetched {new Date(result.retrievedAt).toLocaleString()} ·{" "}
            {result.creditCost ?? "—"} credits on the latest page
          </span>
          {result.after && lastQuery && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void runSearch(lastQuery, result.after!)}
            >
              Load more advertiser ads
            </button>
          )}
          {!result.ads.length &&
            lastQuery &&
            (lastQuery.mode === "page" ||
              (lastQuery.mode === "library" &&
                lastQuery.competitorIds?.length === 1)) && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void runSearch(lastQuery, undefined, true)}
              >
                Try live collection
              </button>
            )}
        </div>
      )}
      {errorBlock}
      {notice && (
        <p role="status" className="fp-notice">
          {notice}
        </p>
      )}
      {library.reviewedAt && (
        <p className="fp-edited">
          Library updated {new Date(library.reviewedAt).toLocaleString()}
          {library.reviewedBy ? " · " + library.reviewedBy : ""}
        </p>
      )}
      {editing && (
        <dialog
          ref={editor}
          className="fp-dialog"
          onCancel={(e) => {
            e.preventDefault();
            setEditing(null);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveCompetitor();
            }}
          >
            <header>
              <h3>Review competitor</h3>
              <button
                type="button"
                aria-label="Close competitor editor"
                onClick={() => setEditing(null)}
              >
                ×
              </button>
            </header>
            <label className="field">
              Competitor name
              <input
                required
                maxLength={200}
                value={editing.name}
                onChange={(e) => {
                  setEditing({ ...editing, name: e.target.value });
                  setConfirmed(false);
                }}
              />
            </label>
            <div className="fp-editor-grid">
              <label className="field">
                Website
                <input
                  value={editing.website || editing.domain}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      website: e.target.value,
                      domain: e.target.value
                        .replace(/^https?:\/\//, "")
                        .split("/")[0],
                    })
                  }
                  placeholder="competitor.com"
                />
              </label>
              <label className="field">
                Market or location
                <input
                  maxLength={200}
                  value={editing.market || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, market: e.target.value })
                  }
                  placeholder="e.g. Toronto, Canada"
                />
              </label>
            </div>
            <label className="field">
              Foreplay brand IDs
              <input
                value={brandsText}
                onChange={(e) => {
                  setBrandsText(e.target.value);
                  setConfirmed(false);
                }}
                placeholder="Filled from advertiser search"
              />
              <small>Comma-separated IDs for this advertiser.</small>
            </label>
            <label className="field">
              Facebook Page IDs
              <input
                value={pagesText}
                onChange={(e) => {
                  setPagesText(e.target.value);
                  setConfirmed(false);
                }}
                placeholder="Comma-separated numeric Page IDs"
              />
              <small>
                Attach up to five Pages for this competitor. Saved Page IDs are
                used for ad lookups.
              </small>
            </label>
            <label className="field">
              Team notes
              <textarea
                maxLength={1000}
                value={editing.notes || ""}
                onChange={(e) =>
                  setEditing({ ...editing, notes: e.target.value })
                }
              />
            </label>
            {editing.pageUrl && (
              <a href={editing.pageUrl} target="_blank" rel="noreferrer">
                Check advertiser in source ↗
              </a>
            )}
            <label className="fp-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I checked that these advertiser IDs or Pages belong to this
              competitor.
            </label>
            {errorBlock}
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button type="submit" disabled={!confirmed || saving}>
                {saving ? "Saving…" : "Save competitor"}
              </button>
            </footer>
          </form>
        </dialog>
      )}
      {clientPicking && (
        <ClientPicker
          clients={clients}
          version={catalogVersion}
          onClose={() => setClientPicking(false)}
          onSaved={(next, nextVersion, id) => {
            onClients(next);
            setCatalogVersion(nextVersion);
            setClientPicking(false);
            onClient(id);
          }}
        />
      )}
      {clientEdit && (
        <dialog
          ref={clientEditor}
          className="fp-dialog"
          onCancel={(e) => {
            e.preventDefault();
            setClientEdit(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveClient();
            }}
          >
            <header>
              <h3>Edit client details</h3>
              <button
                type="button"
                aria-label="Close client editor"
                onClick={() => setClientEdit(null)}
              >
                ×
              </button>
            </header>
            <label className="field">
              Client name
              <input readOnly value={clientEdit.name} />
            </label>
            {clientEdit.metaAccountId ? (
              <p>
                Meta account: {clientEdit.metaAccountId} · {clientEdit.currency}
              </p>
            ) : (
              <p>
                Use Select client to link this research library to its Meta ad
                account.
              </p>
            )}
            <label className="field">
              Website (optional)
              <input
                value={clientEdit.evidence}
                onChange={(e) =>
                  setClientEdit({ ...clientEdit, evidence: e.target.value })
                }
              />
            </label>
            <label className="field">
              Market or location (optional)
              <input
                maxLength={200}
                value={clientEdit.market}
                onChange={(e) =>
                  setClientEdit({ ...clientEdit, market: e.target.value })
                }
              />
            </label>
            <label className="field">
              Country
              <select
                value={clientEdit.country}
                onChange={(e) =>
                  setClientEdit({ ...clientEdit, country: e.target.value })
                }
              >
                <option value="">Not specified</option>
                {[
                  ["CA", "Canada"],
                  ["US", "United States"],
                  ["GB", "United Kingdom"],
                  ["PK", "Pakistan"],
                  ["AE", "United Arab Emirates"],
                  ["AU", "Australia"],
                  ["IN", "India"],
                ].map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {errorBlock}
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setClientEdit(null)}
              >
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save client"}
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </div>
  );
}
