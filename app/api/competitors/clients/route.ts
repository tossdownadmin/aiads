import { NextResponse } from "next/server";
import { z } from "zod";
import { paidSourceSession } from "../../../../lib/competitors/auth";
import { clientIdSchema } from "../../../../lib/competitors/library";
import {
  LibraryConflict,
  readClientCatalog,
  writeClientCatalog,
} from "../../../../lib/competitors/store";
const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const client = z.object({
  id: clientIdSchema,
  name: z.string().trim().min(1).max(200),
  market: z.string().trim().min(1).max(200),
  country: z.string().regex(/^[A-Z]{2}$/),
  evidence: z
    .string()
    .url()
    .refine((v) => new URL(v).protocol === "https:"),
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
});
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
export async function PUT(request: Request) {
  const session = await paidSourceSession();
  if (!session?.user?.email)
    return reply({ error: "Sign in to edit client brands." }, 401);
  const input = z
    .object({
      clients: z.array(client).min(1).max(200),
      version: z.string().max(200).nullable(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return reply(
      { error: "Check the client name, market, country and website." },
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
      current.value.clients.some(
        (c) => !input.data.clients.some((next) => next.id === c.id),
      )
    )
      return reply(
        { error: "Keep existing clients when editing the shared list." },
        400,
      );
    return reply(
      await writeClientCatalog(
        input.data.clients,
        input.data.version,
        session.user.email,
      ),
    );
  } catch (error) {
    return error instanceof LibraryConflict
      ? reply(
          {
            error:
              "Another teammate edited the client list. Reload before saving.",
          },
          409,
        )
      : reply({ error: "The client list could not be saved." }, 503);
  }
}
