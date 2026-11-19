import { NextResponse } from "next/server";
import { z } from "zod";
import { paidSourceSession } from "../../../../lib/competitors/auth";
import {
  clientIdSchema,
  librarySchema,
} from "../../../../lib/competitors/library";
import {
  clientExists,
  readLibrary,
  writeLibrary,
  LibraryConflict,
} from "../../../../lib/competitors/store";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  if (!(await paidSourceSession()))
    return reply({ error: "Sign in to open the competitor library." }, 401);
  const client = clientIdSchema.safeParse(
    new URL(request.url).searchParams.get("clientId"),
  );
  if (!client.success) return reply({ error: "Choose a client." }, 400);
  try {
    if (!(await clientExists(client.data)))
      return reply({ error: "Unknown client." }, 404);
    const result = await readLibrary(client.data);
    return reply({ ...result.value, version: result.version });
  } catch {
    return reply({ error: "The competitor library is unavailable." }, 503);
  }
}
export async function PUT(request: Request) {
  const session = await paidSourceSession();
  if (!session?.user?.email)
    return reply({ error: "Sign in to edit the competitor library." }, 401);
  return update(request, session.user.email);
}
async function update(request: Request, email: string) {
  const raw = await request.json().catch(() => null);
  const metadata = z
    .object({
      clientId: clientIdSchema,
      version: z.string().max(200).nullable(),
    })
    .safeParse(raw);
  const data = librarySchema.safeParse(raw);
  if (!metadata.success || !data.success)
    return reply(
      {
        error: !data.success
          ? data.error.issues[0].message
          : "Reload the library before editing.",
      },
      400,
    );
  try {
    if (!(await clientExists(metadata.data.clientId)))
      return reply({ error: "Unknown client." }, 404);
    const result = await writeLibrary(
      metadata.data.clientId,
      data.data,
      metadata.data.version,
      email,
    );
    return reply({ ...result.value, version: result.version });
  } catch (error) {
    return error instanceof LibraryConflict
      ? reply(
          {
            error:
              "Another teammate updated this list. Reload the library and review your change.",
          },
          409,
        )
      : reply({ error: "The competitor library could not be saved." }, 503);
  }
}
