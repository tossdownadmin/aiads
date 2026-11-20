import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { z } from "zod";
import { verifyAdminSession } from "../../../../../lib/auth";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!(await verifyAdminSession()))
    return NextResponse.json(
      { error: "Sign in to view report evidence." },
      { status: 401 },
    );
  const params = new URL(request.url).searchParams;
  const query = z
    .object({
      runId: z.string().uuid(),
      file: z.enum(["output", "evidence", "skill"]),
    })
    .safeParse({
      runId: params.get("runId"),
      file: params.get("file") || "output",
    });
  if (!query.success)
    return NextResponse.json(
      { error: "Choose a valid report execution record." },
      { status: 400 },
    );
  try {
    const file = await get(
      "reports/skill-runs/" +
        query.data.runId +
        "/" +
        query.data.file +
        ".json",
      { access: "private", useCache: false },
    );
    if (!file?.stream)
      return NextResponse.json(
        { error: "The execution record is unavailable." },
        { status: 404 },
      );
    return new Response(file.stream, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The execution record could not be read." },
      { status: 503 },
    );
  }
}
