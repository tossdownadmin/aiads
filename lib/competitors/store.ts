import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  head,
  put,
} from "@vercel/blob";
import { clientCatalog, type ClientSeed } from "./catalog";
import type { Library, ConfirmedCompetitor } from "./library";
export type { ConfirmedCompetitor } from "./library";

export class LibraryConflict extends Error {}
async function readVersioned<T>(
  path: string,
  fallback: T,
): Promise<{ value: T; version: string | null }> {
  let metadata;
  try {
    metadata = await head(path);
  } catch (error) {
    if (error instanceof BlobNotFoundError)
      return { value: fallback, version: null };
    throw error;
  }
  const file = await get(path, { access: "private", useCache: false });
  if (!file?.stream) throw new Error("Library body unavailable");
  return {
    value: (await new Response(file.stream).json()) as T,
    version: metadata.etag,
  };
}
async function writeVersioned(
  path: string,
  value: unknown,
  version: string | null,
) {
  try {
    const blob = await put(path, JSON.stringify(value), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: !!version,
      contentType: "application/json",
      ...(version ? { ifMatch: version } : {}),
    });
    return blob.etag;
  } catch (error) {
    if (
      error instanceof BlobPreconditionFailedError ||
      (error instanceof Error && /already exists/i.test(error.message))
    )
      throw new LibraryConflict();
    throw error;
  }
}
const libraryPath = (clientId: string) =>
  "competitors/brand-maps/" + clientId + ".json";
export async function readLibrary(clientId: string) {
  const result = await readVersioned<Library>(libraryPath(clientId), {
    competitors: [],
    searches: [],
  });
  return {
    ...result,
    value: { ...result.value, searches: result.value.searches || [] },
  };
}
export async function readCompetitors(
  clientId: string,
): Promise<ConfirmedCompetitor[]> {
  return (await readLibrary(clientId)).value.competitors;
}
export async function writeLibrary(
  clientId: string,
  value: Library,
  version: string | null,
  reviewedBy: string,
) {
  const current = await readLibrary(clientId);
  if (current.version !== version) throw new LibraryConflict();
  const saved = { ...value, reviewedBy, reviewedAt: new Date().toISOString() };
  const nextVersion = await writeVersioned(
    libraryPath(clientId),
    saved,
    version,
  );
  return { value: saved, version: nextVersion };
}
const clientsPath = "competitors/clients-v1.json";
export async function readClientCatalog() {
  return readVersioned<{ clients: ClientSeed[] }>(clientsPath, {
    clients: clientCatalog,
  });
}
export async function clientExists(id: string) {
  return (await readClientCatalog()).value.clients.some(
    (client) => client.id === id,
  );
}
export async function writeClientCatalog(
  clients: ClientSeed[],
  version: string | null,
  editedBy: string,
) {
  const current = await readClientCatalog();
  if (current.version !== version) throw new LibraryConflict();
  const nextVersion = await writeVersioned(
    clientsPath,
    { clients, editedBy, editedAt: new Date().toISOString() },
    version,
  );
  return { clients, version: nextVersion };
}
export type ClientBoard = { id: string; name: string };
export async function readClientBoard(
  clientId: string,
): Promise<ClientBoard | null> {
  const file = await get("competitors/client-boards/" + clientId + ".json", {
    access: "private",
    useCache: false,
  });
  return file?.stream ? (await new Response(file.stream).json()).board : null;
}
export async function writeClientBoard(
  clientId: string,
  board: ClientBoard | null,
) {
  await put(
    "competitors/client-boards/" + clientId + ".json",
    JSON.stringify({ board }),
    {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
    },
  );
}
