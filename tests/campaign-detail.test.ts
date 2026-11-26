import { afterEach, expect, it, vi } from "vitest";
import { budget, creative, readDetails } from "../lib/meta/campaign-detail";
import { campaignCards } from "../lib/reports/detail-view";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const range = { since: "2026-11-01", until: "2026-11-18" };

it("formats Meta budgets using the account currency minor unit", () => {
  expect(budget("1500", "CAD")).toBe("CAD 15.00");
  expect(budget("1500", "JPY")).toBe("JPY 1,500");
});

it("retains dynamic copy variants and carousel cards and escapes them in downloadable HTML", () => {
  const c = creative({
    id: "x",
    body: "<script>alert(1)</script>",
    object_story_spec: {
      link_data: {
        child_attachments: [
          { name: "Card", image_url: "https://example.com/a.jpg" },
        ],
      },
    },
    asset_feed_spec: {
      bodies: [{ text: "Variant" }],
      videos: [{ video_id: "200" }],
    },
    image_url: "https://example.com/secret?access_token=private",
  });
  expect(c.copy).toEqual(["<script>alert(1)</script>", "Variant"]);
  expect(c.assets.find((a) => a.kind === "Carousel card")?.title).toBe("Card");
  const html = campaignCards(
    [
      {
        id: "campaign",
        name: "Campaign",
        status: "ACTIVE",
        objective: "OUTCOME_AWARENESS",
      },
    ],
    {
      campaign: {
        notes: [],
        sets: [
          {
            id: "set",
            name: "Ad set",
            status: "PAUSED",
            settings: {},
            ads: [{ id: "ad", name: "Ad", status: "PAUSED", creative: c }],
          },
        ],
      },
    },
    "CAD",
    "test",
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>alert");
  expect(html).not.toContain("access_token");
});

it("joins paused inventory and insight-only ads and reports a denied video while preserving the report", async () => {
  vi.stubEnv("META_SYSTEM_USER_TOKEN", "test-only");
  const urls: URL[] = [];
  vi.stubGlobal("fetch", async (u: URL) => {
    urls.push(u);
    if (u.pathname.endsWith("/200"))
      return Response.json(
        { error: { code: 200, message: "Permission denied" } },
        { status: 403 },
      );
    if (u.pathname.endsWith("/adsets"))
      return Response.json({
        data: [
          {
            id: "set",
            campaign_id: "campaign",
            name: "Paused set",
            effective_status: "PAUSED",
            daily_budget: "1500",
          },
        ],
      });
    if (u.pathname.endsWith("/ads"))
      return Response.json({
        data: [
          {
            id: "ad",
            adset_id: "set",
            campaign_id: "campaign",
            name: "Video",
            effective_status: "PAUSED",
            creative: {
              id: "creative",
              video_id: "200",
              body: "Original copy",
            },
          },
        ],
      });
    if (u.searchParams.get("level") === "ad")
      return Response.json({
        data: [
          {
            campaign_id: "campaign",
            adset_id: "set",
            ad_id: "historical",
            ad_name: "Archived ad",
            spend: "10",
          },
        ],
      });
    return Response.json({ data: [] });
  });
  const [result] = await readDetails("act_1", "CAD", ["campaign"], [range]);
  const s = result.campaign.sets[0];
  expect(s.settings["Daily budget"]).toBe("CAD 15.00");
  expect(s.status).toBe("PAUSED");
  expect(s.ads.map((a) => a.id)).toEqual(["ad", "historical"]);
  expect(s.ads[0].creative.notes).toContain(
    "Video playback · Meta denied access for this connection.",
  );
  expect(
    urls
      .find((u) => u.searchParams.get("level") === "ad")
      ?.searchParams.get("time_range"),
  ).toBe(JSON.stringify(range));
});

it("keeps ad results when Meta rejects the optional Instagram profile visit metric", async () => {
  vi.stubEnv("META_SYSTEM_USER_TOKEN", "test-only");
  vi.stubGlobal("fetch", async (u: URL) => {
    const fields = u.searchParams.get("fields") || "";
    if (fields.includes("instagram_profile_visits"))
      return Response.json(
        {
          error: {
            code: 100,
            message: "instagram_profile_visits is not a valid field",
          },
        },
        { status: 400 },
      );
    if (u.searchParams.get("level") === "ad")
      return Response.json({
        data: [
          {
            campaign_id: "campaign",
            adset_id: "set",
            ad_id: "ad",
            ad_name: "Observed ad",
            spend: "5",
            actions: [{ action_type: "link_click", value: "67" }],
          },
        ],
      });
    return Response.json({ data: [] });
  });
  const [result] = await readDetails("act_1", "CAD", ["campaign"], [range]);
  expect(result.campaign.sets[0].ads[0].stats?.linkClicks).toBe(67);
  expect(result.campaign.notes).toContain(
    "Instagram profile visits unavailable at ad level.",
  );
});

it('keeps dialog targets unique between report windows and shows metrics for the campaign objective', () => {
  const campaign = {id:'campaign',name:'Video views',status:'ACTIVE',objective:'OUTCOME_ENGAGEMENT'};
  const ad = {id:'ad',name:'Video ad',status:'PAUSED',creative:creative({body:'Original text'})};
  const details = {campaign:{notes:[],sets:[{id:'set',name:'Audience',status:'PAUSED',settings:{Optimization:'THRUPLAY'},ads:[ad]}]}};
  const html = campaignCards([campaign],details,'CAD','week') + campaignCards([campaign],details,'CAD','month');
  const targets = Array.from(html.matchAll(/<dialog[^>]+id="([^"]+)"/g),m=>m[1]);
  expect(targets).toHaveLength(2);
  expect(new Set(targets).size).toBe(2);
  expect(html).toContain('Cost per ThruPlay');
  expect(html).toContain('All ad sets');
});
