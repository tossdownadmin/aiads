import { NextResponse } from "next/server";
import { z } from "zod";
import { paidSourceSession } from "../../../../lib/competitors/auth";
import { clientIdSchema } from "../../../../lib/competitors/library";
import {
  LibraryConflict,
  readClientCatalog,
  writeClientCatalog,
} from "../../../../lib/competitors/store";
import { getAdAccounts } from "../../../../lib/meta/read";

export const runtime = "nodejs";
const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const version = z.string().max(200).nullable();
const accountId = z.string().regex(/^act_\d+$/);
const client = z.object({
  id: clientIdSchema,
  name: z.string().trim().min(1).max(200),
  market: z.string().trim().max(200).default(""),
  country: z.union([z.string().regex(/^[A-Z]{2}$/), z.literal("")]).default(""),
  evidence: z
    .union([
      z
        .string()
        .url()
        .refine((v) => new URL(v).protocol === "https:"),
      z.literal(""),
    ])
    .default(""),
  competitors: z
    .array(
      z.object({
        name: z.string().max(200),
        domain: z.string().max(200),
        evidence: z.string().url(),
      }),
    )
    .max(20)
    .default([]),
  metaAccountId: accountId.optional(),
  currency: z.string().max(10).optional(),
});
const failure = (error: unknown) =>
  error instanceof LibraryConflict
    ? reply(
        {
          error:
            "Another teammate edited the client list. Reload before saving.",
        },
        409,
      )
    : reply(
        {
          error:
            "The client list could not be saved. Check the Meta connection and retry.",
        },
        503,
      );
export async function GET() {
  if (!(await paidSourceSession()))
    return reply({ error: "Sign in to open client brands." }, 401);
  try {
    const r = await readClientCatalog();
    return reply({ clients: r.value.clients, version: r.version });
  } catch {
    return reply({ error: "The client list is unavailable." }, 503);
  }
}
export async function POST(request: Request) {
  const session = await paidSourceSession();
  if (!session?.user?.email)
    return reply({ error: "Sign in to select a client." }, 401);
  const input = z
    .object({ accountId, existingClientId: clientIdSchema.optional(), version })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return reply({ error: "Select an available Meta ad account." }, 400);
  if (!process.env.META_SYSTEM_USER_TOKEN)
    return reply({ error: "The Meta connection is unavailable." }, 503);
  try {
    const account = (await getAdAccounts()).find(
      (a) => a.id === input.data.accountId,
    );
    if (!account)
      return reply(
        {
          error:
            "This ad account is not available to the current Meta connection.",
        },
        403,
      );
    const current = await readClientCatalog();
    if (current.version !== input.data.version) throw new LibraryConflict();
    const linked = current.value.clients.find(
      (c) => c.metaAccountId === account.id,
    );
    if (linked) {
      if (
        input.data.existingClientId &&
        input.data.existingClientId !== linked.id
      )
        return reply(
          {
            error:
              "This account is already linked to another research library.",
          },
          409,
        );
      if (
        linked.name !== account.name ||
        linked.currency !== account.currency
      ) {
        const clients = current.value.clients.map((c) =>
          c.id === linked.id
            ? { ...c, name: account.name, currency: account.currency }
            : c,
        );
        return reply({
          ...(await writeClientCatalog(
            clients,
            current.version,
            session.user.email,
          )),
          selectedClientId: linked.id,
        });
      }
      return reply({
        clients: current.value.clients,
        version: current.version,
        selectedClientId: linked.id,
      });
    }
    const existing = input.data.existingClientId
      ? current.value.clients.find((c) => c.id === input.data.existingClientId)
      : undefined;
    if (input.data.existingClientId && !existing)
      return reply(
        { error: "The existing research library is unavailable." },
        404,
      );
    if (existing?.metaAccountId)
      return reply(
        {
          error: "This library is already linked to a different Meta account.",
        },
        409,
      );
    const selected = {
      ...(existing || {
        id: "meta-" + account.id.slice(4),
        market: "",
        country: "",
        evidence: "",
        competitors: [],
      }),
      name: account.name,
      metaAccountId: account.id,
      currency: account.currency,
    };
    if (!existing && current.value.clients.some((c) => c.id === selected.id))
      return reply(
        { error: "A research library already uses this account ID." },
        409,
      );
    const clients = existing
      ? current.value.clients.map((c) => (c.id === existing.id ? selected : c))
      : [...current.value.clients, selected];
    if (clients.length > 200)
      return reply(
        { error: "The research library supports up to 200 clients." },
        400,
      );
    return reply({
      ...(await writeClientCatalog(
        clients,
        current.version,
        session.user.email,
      )),
      selectedClientId: selected.id,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  const session = await paidSourceSession();
  if (!session?.user?.email)
    return reply({ error: "Sign in to edit client details." }, 401);
  const input = z
    .object({ clients: z.array(client).min(1).max(200), version })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return reply(
      { error: "Check the optional client website, market and country." },
      400,
    );
  if (
    new Set(input.data.clients.map((c) => c.id)).size !==
    input.data.clients.length
  )
    return reply({ error: "Duplicate client ID." }, 400);
  try {
    const current = await readClientCatalog();
    if (
      input.data.clients.length !== current.value.clients.length ||
      input.data.clients.some(
        (c) => !current.value.clients.some((old) => old.id === c.id),
      )
    )
      return reply(
        { error: "Select new clients from the Meta account list." },
        400,
      );
    if (
      input.data.clients.some(
        (c) =>
          c.metaAccountId !==
          current.value.clients.find((old) => old.id === c.id)?.metaAccountId,
      )
    )
      return reply(
        {
          error:
            "Use Select client to link an existing library to a Meta account.",
        },
        400,
      );
    const clients = input.data.clients.map((c) => ({
      ...c,
      name: current.value.clients.find((old) => old.id === c.id)!.name,
      currency: current.value.clients.find((old) => old.id === c.id)!.currency,
    }));
    return reply(
      await writeClientCatalog(clients, input.data.version, session.user.email),
    );
  } catch (error) {
    return failure(error);
  }
}
