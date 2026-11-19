import { NextResponse } from "next/server";
import { z } from "zod";
import {
  findForeplayBrands,
  foreplayError,
} from "../../../../lib/competitors/foreplay";
import { verifyPaidSourceSession } from "../../../../lib/competitors/access";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!(await verifyPaidSourceSession()))
    return NextResponse.json(
      { error: "Sign in to search advertisers." },
      { status: 401 },
    );
  const input = z
    .object({
      domain: z.string().trim().max(200).optional(),
      query: z.string().trim().min(1).max(100).optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success || (!input.data.domain && !input.data.query))
    return NextResponse.json(
      { error: "Enter an advertiser name or website." },
      { status: 400 },
    );
  let domain = input.data.domain;
  if (domain) {
    try {
      domain = new URL(
        domain.includes("://") ? domain : "https://" + domain,
      ).hostname
        .replace(/^www\./, "")
        .toLowerCase();
    } catch {
      return NextResponse.json(
        { error: "Enter a valid website." },
        { status: 400 },
      );
    }
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain))
      return NextResponse.json(
        { error: "Enter a valid website." },
        { status: 400 },
      );
  }
  try {
    return NextResponse.json(
      {
        ...(await findForeplayBrands(
          domain || input.data.query!,
          domain ? "domain" : "name",
        )),
        lookupMethod: domain ? "domain" : "name",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const failure = foreplayError(error);
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status },
    );
  }
}
