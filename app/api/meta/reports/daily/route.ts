import {after} from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "../../../../../lib/auth";
import { validDay } from "../../../../../lib/reports/model";
import {
  DailyConflict,
  DailyInputError,
  dailyState,
  startDaily,
  advanceDaily,
  discardDaily,
  resumeDailyJob,
  workDailyPending,
} from "../../../../../lib/reports/daily-jobs";
export const runtime = "nodejs";
export const maxDuration = 300;
function reply(body: unknown, status = 200) {
  const data = new TextEncoder().encode(JSON.stringify(body));
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        controller.enqueue(data.subarray(offset, offset + 65536));
        offset += 65536;
        if (offset >= data.length) controller.close();
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    },
  );
}
export async function GET() {
  if (!(await verifyAdminSession()))
    return reply({ error: "Sign in to open the daily report." }, 401);
  try {
    return reply(await dailyState());
  } catch {
    return reply({ error: "The saved daily report could not be opened." }, 503);
  }
}
const shape = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    version: z.string().max(200).nullable(),
    accountIds: z
      .array(z.string().regex(/^act_\d+$/))
      .min(1)
      .max(200)
      .optional(),
    date: z.string().refine(validDay).optional(),
    template: z.unknown().optional(),
    skillName: z.string().min(1).max(120).optional(),
    skillSha:z.string().min(1).max(200).optional(),
  }),
  z.object({ action: z.literal("resume"), jobId: z.string().uuid() }),
  z.object({ action: z.literal("advance"), jobId: z.string().uuid() }),
  z.object({ action: z.literal("discard"), jobId: z.string().uuid() }),
]);
export async function POST(request: Request) {
  if (!(await verifyAdminSession()))
    return reply({ error: "Sign in to update the daily report." }, 401);
  const raw = await request.json().catch(() => null),
    parsed = shape.safeParse(
      raw && typeof raw === "object" ? { action: "start", ...raw } : null,
    );
  if (!parsed.success)
    return reply(
      { error: "Check the report accounts, date, skill and pending update." },
      400,
    );
  try {
    const data = parsed.data;
    const result=data.action==='start'?await startDaily(data):data.action==='resume'?await resumeDailyJob(data.jobId):data.action==='discard'?await discardDaily(data.jobId):await advanceDaily(data.jobId);
    if(result.job.status==='running')after(async()=>{try{await workDailyPending(result.job.id);}catch{console.error('Daily background checkpoint unavailable',{job:result.job.id});}});
    return reply(result);

  } catch (error) {
    return error instanceof DailyConflict
      ? reply({ error: error.message }, 409)
      : error instanceof DailyInputError
        ? reply({ error: error.message }, 400)
        : reply(
            {
              error:
                "The skill-based update could not start. Check the selected skill and connections. The last saved report remains available.",
            },
            502,
          );
  }
}
