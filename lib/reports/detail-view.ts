import type { CampaignDetail } from "../meta/campaign-detail";
import type { Metrics } from "./model";

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function safe(value?: string) {
  try {
    const u = new URL(value || "");
    return u.protocol === "https:" && !u.searchParams.has("access_token")
      ? escape(u.href)
      : "";
  } catch {
    return "";
  }
}
const fields = (items: [string, string][]) =>
  "<dl>" +
  items
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        "<div><dt>" + escape(k) + "</dt><dd>" + escape(v) + "</dd></div>",
    )
    .join("") +
  "</dl>";
function measurements(s: Metrics | undefined, currency: string) {
  if (!s) return "<p>No insight row for this reporting period.</p>";
  const number = (n: number) =>
    n.toLocaleString("en", { maximumFractionDigits: 3 });
  const labels: Partial<Record<keyof Metrics, string>> = {
    spend: "Spend",
    impressions: "Impressions",
    reach: "Reach",
    frequency: "Frequency",
    clicks: "Clicks",
    ctr: "CTR",
    cpc: "CPC",
    thruplays: "ThruPlays",
    instagramVisits: "Instagram visits",
    facebookVisits: "Facebook visits",
    landingViews: "Landing page views",
    linkClicks: "Link clicks",
    purchases: "Purchases",
    purchaseValue: "Purchase value",
    roas: "Purchase ROAS",
    leads: "Leads",
    conversations: "Conversations",
  };
  const rows: [string, string][] = [];
  for (const [key, label] of Object.entries(labels)) {
    const k = key as keyof Metrics,
      v = s[k];
    if (v === null) continue;
    rows.push([
      label,
      ["spend", "cpc", "purchaseValue"].includes(k)
        ? currency + " " + number(v)
        : number(v) + (k === "ctr" ? "%" : k === "roas" ? "×" : ""),
    ]);
    if (
      [
        "thruplays",
        "instagramVisits",
        "facebookVisits",
        "purchases",
        "leads",
        "conversations",
      ].includes(k) &&
      s.spend !== null &&
      v > 0
    )
      rows.push([
        "Cost per " + label.toLowerCase().replace(/s$/, ""),
        currency + " " + number(s.spend / v),
      ]);
  }
  return fields(rows);
}
export function detailBody(c: CampaignDetail, currency: string) {
  const notes = (note: string) =>
    '<p class="rep-detail-note">' + escape(note) + "</p>";
  return (
    '<div class="rep-detail"><p>Results use this report’s date range. Status, settings and creative were read when the report was generated. Meta media links may expire.</p>' +
    c.notes.map(notes).join("") +
    (c.sets.length ? "" : notes("No ad sets returned for this campaign.")) +
    c.sets
      .map(
        (s) =>
          "<details><summary>" +
          escape(s.name) +
          " <small>" +
          escape(s.status) +
          " · " +
          s.ads.length +
          " ads</small></summary><section>" +
          fields([
            ["Ad set ID", s.id],
            ...(Object.entries(s.settings) as [string, string][]),
          ]) +
          (s.targeting && Object.keys(s.targeting).length
            ? "<details><summary>All audience settings</summary><pre>" +
              escape(JSON.stringify(s.targeting, null, 2)) +
              "</pre></details>"
            : "") +
          measurements(s.stats, currency) +
          (s.ads.length ? "" : notes("No ads returned.")) +
          s.ads
            .map((a) => {
              const k = a.creative;
              const link = (href: string, label: string) =>
                safe(href)
                  ? '<a target="_blank" rel="noopener noreferrer" href="' +
                    safe(href) +
                    '">' +
                    escape(label) +
                    "</a>"
                  : "";
              const assets = k.assets
                .map(
                  (m) =>
                    "<figure>" +
                    (safe(m.video)
                      ? '<video controls preload="none" poster="' +
                        safe(m.image) +
                        '" src="' +
                        safe(m.video) +
                        '"></video>'
                      : safe(m.image)
                        ? '<img loading="lazy" referrerpolicy="no-referrer" src="' +
                          safe(m.image) +
                          '" alt="' +
                          escape(m.kind) +
                          '">'
                        : "") +
                    "<figcaption>" +
                    escape(
                      [m.kind, m.title, m.copy, m.cta]
                        .filter(Boolean)
                        .join(" · "),
                    ) +
                    " " +
                    (m.link ? link(m.link, "Destination") : "") +
                    (m.videoId && !safe(m.video)
                      ? " · Playback URL unavailable"
                      : "") +
                    "</figcaption></figure>",
                )
                .join("");
              return (
                "<details><summary>" +
                escape(a.name) +
                " <small>" +
                escape(a.status) +
                "</small></summary><section>" +
                fields([
                  ["Ad ID", a.id],
                  ["Creative ID", k.id],
                  ["Primary text", k.copy.join("\n\n")],
                  ["Headline", k.titles.join("\n")],
                  ["Description", k.descriptions.join("\n")],
                  ["Call to action", k.ctas.join(", ")],
                ]) +
                k.links.map((l) => link(l, l)).join(" ") +
                (k.post
                  ? "<p>" + link(k.post, "Open original post") + "</p>"
                  : "") +
                (!k.copy.length
                  ? notes("Primary text unavailable in this read.")
                  : "") +
                measurements(a.stats, currency) +
                (assets
                  ? '<div class="rep-assets">' + assets + "</div>"
                  : notes("No creative media returned.")) +
                k.notes.map(notes).join("") +
                (a.days?.length
                  ? "<details><summary>Daily delivery · " +
                    a.days.length +
                    " days</summary>" +
                    fields(
                      a.days.map((d) => [
                        d.day,
                        [
                          d.impressions + " impressions",
                          d.ctr + "% CTR",
                          currency + " " + d.cpc + " CPC",
                          d.frequency + " frequency",
                        ].join(" · "),
                      ]),
                    ) +
                    "</details>"
                  : "") +
                "</section></details>"
              );
            })
            .join("") +
          "</section></details>",
      )
      .join("") +
    "</div>"
  );
}
export const detailStyles = `
.rep-detail-row{display:none}tr:has(.rep-toggle[open])+.rep-detail-row{display:table-row}.rep-toggle summary,.rep-detail summary{cursor:pointer;color:#086f65;font-weight:650;white-space:normal;line-height:1.45}.rep-toggle summary:hover,.rep-detail summary:hover{text-decoration:underline}
.rep-detail-row>td{white-space:normal;text-align:left}.rep-detail{white-space:normal;text-align:left;color:#17372e;background:#f4f9f7;padding:12px;font:14px/1.5 system-ui,sans-serif}.rep-detail details{background:#fff;border:1px solid #dbe8e4;border-radius:8px;padding:9px 12px;margin:6px 0}.rep-detail section{padding:4px 0}.rep-detail summary small{color:#516a61;font-weight:400}.rep-detail dl{display:flex;flex-wrap:wrap;gap:8px 20px;margin:8px 0}.rep-detail dl>div{min-width:75px;max-width:100%}.rep-detail dt{font-size:12px;color:#536c63}.rep-detail dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.rep-detail a{overflow-wrap:anywhere}.rep-assets{display:flex;flex-wrap:wrap;gap:10px}.rep-assets figure{max-width:270px;margin:4px}.rep-assets img,.rep-assets video{display:block;max-width:100%;max-height:220px}.rep-detail-note{color:#604d20}.rep-detail pre{white-space:pre-wrap}
@media print{.rep-detail-row{display:table-row!important}.rep-detail-row,.rep-detail-row>td{break-inside:auto!important}.rep-detail details::details-content{content-visibility:visible}.rep-detail dl{font-size:9pt}}
`;
