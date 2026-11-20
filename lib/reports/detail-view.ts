import type {
  CampaignDetail,
  DetailMap,
  Ad,
  AdSet,
  Asset,
} from "../meta/campaign-detail";
import type { Metrics, CampaignRow } from "./model";
import {
  cash,
  count,
  costPer,
  percent,
  ratio,
  resultKind,
  statusText,
  type ResultKey,
} from "./daily-metrics";

export type GalleryCampaign = {
  id: string;
  name: string;
  status: string;
  objective: string;
  stats?: Metrics;
  settings?: CampaignRow["settings"];
};

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

function keyFor(
  c: GalleryCampaign,
  detail?: CampaignDetail,
): ResultKey | undefined {
  const goals =
    c.settings?.goals ??
    detail?.sets.map((s) => s.settings.Optimization).filter(Boolean) ??
    [];
  const row = {
    conversations: c.stats?.conversations ?? null,
    thruplays: c.stats?.thruplays ?? null,
    name: c.name,
    objective: c.objective,
    settings: { goals, bids: [] },
  };
  return (
    resultKind(row) ??
    (/LINK_CLICKS|TRAFFIC/.test(c.objective) ? "linkClicks" : undefined)
  );
}
function metricStrip(
  stats: Metrics | undefined,
  currency: string,
  key?: ResultKey,
) {
  const result = key ? stats?.[key] : null;
  const labels: Record<ResultKey, [string, string]> = {
    purchases: ["Purchases", "Cost per purchase"],
    leads: ["Leads", "Cost per lead"],
    conversations: ["Conversations", "Cost per conversation"],
    instagramVisits: ["Instagram visits", "Cost per visit"],
    facebookVisits: ["Facebook visits", "Cost per visit"],
    thruplays: ["ThruPlays", "Cost per ThruPlay"],
    landingViews: ["Landing page views", "Cost per view"],
    linkClicks: ["Link clicks", "Cost per click"],
  };
  const cards = [
    ["Spend", cash(stats?.spend, currency)],
    [key ? labels[key][0] : "Reach", count(key ? result : stats?.reach)],
    [
      key ? labels[key][1] : "Frequency",
      key
        ? cash(costPer(stats?.spend, result), currency)
        : count(stats?.frequency),
    ],
    [
      key === "purchases" ? "Purchase ROAS" : "Click-through rate",
      key === "purchases" ? ratio(stats?.roas) : percent(stats?.ctr),
    ],
  ];
  return (
    '<dl class="cg-metrics">' +
    cards
      .map(
        ([label, value]) =>
          "<div><dt>" +
          escape(label) +
          "</dt><dd>" +
          escape(value) +
          "</dd></div>",
      )
      .join("") +
    "</dl>"
  );
}
function status(value: string) {
  return (
    '<span class="cg-status' +
    (value === "ACTIVE" ? " is-active" : "") +
    '">' +
    escape(statusText(value) || "Unreported") +
    "</span>"
  );
}
function link(href: string | undefined, label: string) {
  return safe(href)
    ? '<a href="' +
        safe(href) +
        '" target="_blank" rel="noopener noreferrer">' +
        escape(label) +
        "</a>"
    : "";
}
function media(asset: Asset) {
  const image = safe(asset.image),
    video = safe(asset.video);
  if (video)
    return (
      '<video controls preload="none"' +
      (image ? ' poster="' + image + '"' : "") +
      ' src="' +
      video +
      '"></video>' +
      (image
        ? '<img class="cg-print-poster" src="' +
          image +
          '" alt="Video thumbnail">'
        : "")
    );
  if (image)
    return (
      '<img loading="lazy" referrerpolicy="no-referrer" src="' +
      image +
      '" alt="' +
      escape(asset.kind) +
      '">'
    );
  return (
    '<div class="cg-no-media"><span aria-hidden="true">' +
    (asset.videoId ? "▷" : "▧") +
    "</span><p>" +
    (asset.videoId
      ? "Video preview unavailable"
      : "Creative preview unavailable") +
    "</p></div>"
  );
}
function primaryAsset(ad: Ad) {
  return (
    ad.creative.assets.find((a) => a.video) ||
    ad.creative.assets.find((a) => a.image) ||
    ad.creative.assets[0]
  );
}
function technical(
  ad: Ad,
  set: AdSet,
  campaign: GalleryCampaign,
  currency: string,
) {
  return (
    '<details class="cg-technical"><summary>Technical details</summary>' +
    fields([
      ["Campaign ID", campaign.id],
      ["Ad set ID", set.id],
      ["Ad ID", ad.id],
      ["Creative ID", ad.creative.id],
    ]) +
    (set.targeting
      ? "<h5>Audience configuration</h5><pre>" +
        escape(JSON.stringify(set.targeting, null, 2)) +
        "</pre>"
      : "") +
    (ad.days?.length
      ? '<h5>Daily delivery</h5><div class="cg-daily-scroll"><table><thead><tr><th>Date</th><th>Impressions</th><th>CTR</th><th>CPC</th><th>Frequency</th></tr></thead><tbody>' +
        ad.days
          .map(
            (d) =>
              "<tr><td>" +
              escape(d.day) +
              "</td><td>" +
              escape(d.impressions) +
              "</td><td>" +
              escape(d.ctr) +
              "%</td><td>" +
              escape(currency + " " + (d.cpc || "—")) +
              "</td><td>" +
              escape(d.frequency) +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table></div>"
      : "") +
    "</details>"
  );
}
function adDialog(
  ad: Ad,
  set: AdSet,
  campaign: GalleryCampaign,
  currency: string,
  id: string,
) {
  const creative = ad.creative;
  const notes = [...creative.notes];
  if (!creative.assets.some((a) => a.image || a.video))
    notes.push("Meta did not return a usable media preview for this ad.");
  const copy = (label: string, values: string[]) =>
    values.length
      ? '<section class="cg-copy"><h4>' +
        label +
        "</h4>" +
        values.map((v) => "<p>" + escape(v) + "</p>").join("") +
        "</section>"
      : "";
  return (
    '<dialog class="cg-dialog" id="' +
    id +
    '" aria-labelledby="' +
    id +
    '-title"><div class="cg-sheet"><header class="cg-sheet-head"><div><p>' +
    escape(campaign.name) +
    " · " +
    escape(set.name) +
    '</p><h3 id="' +
    id +
    '-title">' +
    escape(ad.name) +
    '</h3></div><button type="button" data-close-ad aria-label="Close ad details">×</button></header><div class="cg-sheet-body"><div class="cg-full-media">' +
    creative.assets
      .map(
        (a) =>
          "<figure>" +
          media(a) +
          "<figcaption>" +
          escape(
            [a.kind, a.title, a.copy, a.cta ? statusText(a.cta) : ""]
              .filter(Boolean)
              .join(" · "),
          ) +
          "</figcaption></figure>",
      )
      .join("") +
    (!creative.assets.length
      ? '<div class="cg-no-media"><span aria-hidden="true">▧</span><p>Creative preview unavailable</p></div>'
      : "") +
    notes.map((n) => '<p class="cg-note">' + escape(n) + "</p>").join("") +
    '</div><div class="cg-ad-info">' +
    status(ad.status) +
    copy("Primary text", creative.copy) +
    copy("Headline", creative.titles) +
    copy("Description", creative.descriptions) +
    (creative.ctas.length
      ? '<p class="cg-cta">' +
        escape(creative.ctas.map(statusText).join(" · ")) +
        "</p>"
      : "") +
    '<div class="cg-links">' +
    creative.links.map((l) => link(l, "Visit destination")).join("") +
    link(creative.post, "Open original post") +
    "</div><section><h4>Ad performance</h4>" +
    measurements(ad.stats, currency) +
    '</section><section><h4>Audience & delivery</h4><p class="cg-set-name">' +
    escape(set.name) +
    " · " +
    escape(statusText(set.status)) +
    "</p>" +
    fields(Object.entries(set.settings)) +
    "</section>" +
    technical(ad, set, campaign, currency) +
    "</div></div></div></dialog>"
  );
}
export function campaignCards(
  campaigns: GalleryCampaign[],
  details: DetailMap | undefined,
  currency: string,
  scope: string,
) {
  const prefix = "cg-" + scope.replace(/[^a-zA-Z0-9_-]/g, "-");
  return (
    '<div class="cg-campaigns">' +
    campaigns
      .map((campaign, index) => {
        const detail = details?.[campaign.id],
          sets = detail?.sets || [],
          key = keyFor(campaign, detail);
        const id = prefix + "-" + index;
        const ads = sets.flatMap((set) => set.ads.map((ad) => ({ ad, set })));
        const objective =
          statusText(campaign.objective.replace(/^OUTCOME_/, "")) ||
          "Objective unreported";
        return (
          '<section class="cg-campaign" data-campaign-gallery id="' +
          (scope === "audit" ? "campaign-" + escape(campaign.id) : id) +
          '"><header class="cg-campaign-head"><div><p class="cg-objective">' +
          escape(objective) +
          " · " + escape(currency) + " · " +
          sets.length +
          " ad " +
          (sets.length === 1 ? "set" : "sets") +
          " · " +
          ads.length +
          " " +
          (ads.length === 1 ? "ad" : "ads") +
          "</p><h3>" +
          escape(campaign.name) +
          "</h3></div>" +
          status(campaign.status) +
          "</header>" +
          metricStrip(campaign.stats, currency, key) +
          (detail?.notes.length
            ? '<div class="cg-notes">' +
              detail.notes
                .map((n) => '<p class="cg-note">' + escape(n) + "</p>")
                .join("") +
              "</div>"
            : "") +
          (sets.length
            ? '<div class="cg-adset-tabs" role="tablist" aria-label="Ad sets in ' +
              escape(campaign.name) +
              '"><button role="tab" type="button" id="' +
              id +
              '-all" aria-selected="true" aria-controls="' +
              id +
              '-ads" data-set-filter="all">All ad sets <span>' +
              ads.length +
              (ads.length===1?" ad":" ads")+"</span></button>" +
              sets
                .map(
                  (s, i) =>
                    '<button role="tab" type="button" id="' +
                    id +
                    "-set-" +
                    i +
                    '" aria-selected="false" tabindex="-1" aria-controls="' +
                    id +
                    '-ads" data-set-filter="' +
                    i +
                    '">' +
                    escape(s.name) +
                    " <span>" +
                    s.ads.length +
                    (s.ads.length===1?" ad":" ads")+"</span></button>",
                )
                .join("") +
              "</div>"
            : "") +
          sets
            .map(
              (s, i) =>
                '<section class="cg-set-summary" data-set-summary="' +
                i +
                '" hidden><div><h4>' +
                escape(s.name) +
                "</h4>" +
                status(s.status) +
                "</div>" +
                metricStrip(s.stats, currency, key) +
                fields(
                  Object.entries(s.settings).filter(([k]) =>
                    [
                      "Age",
                      "Gender",
                      "Included locations",
                      "Platforms",
                      "Daily budget",
                      "Lifetime budget",
                      "Optimization",
                      "Starts",
                      "Ends",
                    ].includes(k),
                  ),
                ) +
                "</section>",
            )
            .join("") +
          '<div class="cg-ad-grid" role="tabpanel" id="' +
          id +
          '-ads" aria-labelledby="' +
          id +
          '-all">' +
          ads
            .map(({ ad, set }, adIndex) => {
              const setIndex = sets.indexOf(set),
                dialogId = id + "-ad-" + adIndex;
              const asset = primaryAsset(ad);
              return (
                '<article class="cg-ad-card" data-ad-set="' +
                setIndex +
                '"><div class="cg-card-media">' +
                (asset?.video
                  ? media(asset)
                  : '<button class="cg-preview-button" type="button" data-open-ad="' +
                    dialogId +
                    '" aria-haspopup="dialog" aria-controls="' +
                    dialogId +
                    '" aria-label="View ' +
                    escape(ad.name) +
                    '">' +
                    (asset
                      ? media(asset)
                      : '<div class="cg-no-media"><span aria-hidden="true">▧</span><p>Creative preview unavailable</p></div>') +
                    "</button>") +
                '</div><div class="cg-card-content"><p class="cg-card-set">' +
                escape(set.name) +
                '</p><div class="cg-ad-heading"><h4><button type="button" data-open-ad="' +
                dialogId +
                '" aria-haspopup="dialog" aria-controls="' +
                dialogId +
                '">' +
                escape(ad.name) +
                "</button></h4>" +
                status(ad.status) +
                '</div><p class="cg-card-copy">' +
                escape(
                  ad.creative.copy[0] ||
                    ad.creative.titles[0] ||
                    "Ad copy unavailable",
                ) +
                "</p>" +
                metricStrip(ad.stats, currency, key) +
                '<button class="cg-view-ad" type="button" data-open-ad="' +
                dialogId +
                '" aria-haspopup="dialog" aria-controls="' +
                dialogId +
                '">View ad <span aria-hidden="true">↗</span></button></div></article>'
              );
            })
            .join("") +
          "</div>" +
          (!ads.length
            ? '<p class="cg-empty">' +
              (detail
                ? "No ads returned for this campaign."
                : "Creative details are available after generating an updated report.") +
              "</p>"
            : "") +
          ads
            .map(({ ad, set }, i) =>
              adDialog(ad, set, campaign, currency, id + "-ad-" + i),
            )
            .join("") +
          "</section>"
        );
      })
      .join("") +
    "</div>"
  );
}

// This function is self-contained so the same controls can run in downloaded HTML.
export function installGallery(root: Document | HTMLElement) {
  const click = (event: Event) => {
    const target = event.target as HTMLElement;
    if (!target?.closest) return;
    const open = target.closest<HTMLElement>("[data-open-ad]");
    if (open) {
      const gallery = open.closest("[data-campaign-gallery]");
      const dialog = gallery?.querySelector<HTMLDialogElement>(
        "#" + open.dataset.openAd,
      );
      if (dialog && !dialog.open) dialog.showModal();
      return;
    }
    const close = target.closest("[data-close-ad]");
    if (close) {
      close.closest("dialog")?.close();
      return;
    }
    if (target instanceof HTMLDialogElement && event.target === target) {
      target.close();
      return;
    }
    const tab = target.closest<HTMLElement>("[data-set-filter]");
    if (!tab) return;
    const gallery = tab.closest("[data-campaign-gallery]")!;
    const selected = tab.dataset.setFilter;
    gallery
      .querySelectorAll<HTMLElement>("[data-set-filter]")
      .forEach((button) => {
        const active = button === tab;
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
    gallery.querySelectorAll<HTMLElement>("[data-ad-set]").forEach((card) => {
      card.hidden = selected !== "all" && card.dataset.adSet !== selected;
    });
    gallery
      .querySelectorAll<HTMLElement>("[data-set-summary]")
      .forEach((panel) => {
        panel.hidden = panel.dataset.setSummary !== selected;
      });
    gallery
      .querySelector('[role="tabpanel"]')
      ?.setAttribute("aria-labelledby", tab.id);
  };
  const keyboard = (event: Event) => {
    const key = event as KeyboardEvent,
      target = event.target as HTMLElement;
    if (
      !target?.matches("[data-set-filter]") ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(key.key)
    )
      return;
    const buttons = Array.from(
      target.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const index = buttons.indexOf(target as HTMLButtonElement);
    const next =
      key.key === "Home"
        ? 0
        : key.key === "End"
          ? buttons.length - 1
          : (index + (key.key === "ArrowRight" ? 1 : -1) + buttons.length) %
            buttons.length;
    key.preventDefault();
    buttons[next].click();
    buttons[next].focus();
  };
  const mediaError = (event: Event) => {
    const media = event.target as HTMLElement;
    if (
      !media?.matches?.(
        ".cg-card-media img,.cg-card-media video,.cg-full-media img,.cg-full-media video",
      )
    )
      return;
    media.hidden = true;
    const note = document.createElement("p");
    note.className = "cg-note";
    note.textContent =
      "Media preview unavailable. Open the original post for the current creative.";
    media.parentElement?.append(note);
  };
  root.addEventListener("click", click);
  root.addEventListener("keydown", keyboard);
  root.addEventListener("error", mediaError, true);
  return () => {
    root.removeEventListener("click", click);
    root.removeEventListener("keydown", keyboard);
    root.removeEventListener("error", mediaError, true);
  };
}
export const galleryScript = "(" + installGallery.toString() + ")(document);";
export const detailStyles = `
.cg-campaigns{display:grid;gap:24px;margin:18px 0;color:#342d33;font-family:inherit;text-align:left}
.cg-campaign{border:1px solid #e5dfe2;border-radius:16px;background:#fff;overflow:hidden;scroll-margin-top:90px}
.cg-campaign-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:24px 24px 18px}
.cg-campaign-head h3{font-family:inherit;font-size:20px;line-height:1.4;font-weight:600;letter-spacing:-.025em;margin:0;color:#242124;overflow-wrap:anywhere}
.cg-objective{font-size:12px;color:#70676e;margin:0 0 7px}
.cg-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;line-height:1.4;font-weight:600;padding:4px 9px;border-radius:6px;background:#f6f2ef;color:#70676e;white-space:nowrap}
.cg-status.is-active{background:#f6f2ef;color:#342d33}.cg-status.is-active:before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.cg-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0!important;padding:0;border-top:1px solid #f6f2ef;border-bottom:1px solid #f6f2ef}
.cg-metrics>div{padding:16px 24px;min-width:0;border-right:1px solid #f6f2ef}.cg-metrics>div:last-child{border:0}
.cg-metrics dt{font-size:12px;color:#70676e;line-height:1.45;font-weight:400;margin:0 0 5px}.cg-metrics dd{font-size:23px;line-height:1.3;color:#342d33;font-weight:600;margin:0;letter-spacing:-.025em;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.cg-adset-tabs{display:flex;gap:6px;overflow-x:auto;padding:18px 24px 14px;scrollbar-width:thin}
.cg-adset-tabs button{flex-shrink:0;background:#fff;color:#70676e;border:1px solid transparent;border-radius:8px;font:inherit;font-size:13px;font-weight:500;line-height:1.4;padding:9px 12px;cursor:pointer}
.cg-adset-tabs button[aria-selected="true"]{background:#f6f2ef;color:#342d33;border-color:#e5dfe2}
.cg-adset-tabs button span{font-size:11px;padding-left:5px;color:#70676e}
.cg-ad-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:0 24px 24px}
.cg-ad-card{min-width:0;border:1px solid #e5dfe2;border-radius:12px;background:#fff;overflow:hidden;display:flex;flex-direction:column}
.cg-card-media{aspect-ratio:1.25;background:#f6f2ef;position:relative;overflow:hidden}
.cg-preview-button{display:block;background:transparent;border:0;border-radius:0;margin:0;padding:0;width:100%;height:100%;cursor:pointer;color:inherit}
.cg-card-media img,.cg-card-media video{display:block;width:100%;height:100%;object-fit:contain;margin:0}
.cg-card-content{padding:16px;display:flex;flex-direction:column;flex:1;gap:10px}
.cg-card-set{color:#70676e;font-size:11px;margin:0!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cg-ad-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.cg-ad-heading h4{margin:0!important;font-size:15px!important;line-height:1.4;font-weight:600;color:#342d33}
.cg-ad-heading button{font:inherit;border:0;padding:0;color:inherit;background:transparent;cursor:pointer;text-align:left}
.cg-ad-heading .cg-status{font-size:10px;padding:3px 6px}
.cg-card-copy{font-size:13px;line-height:1.6;color:#574e55;margin:0!important;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cg-ad-card .cg-metrics{margin-top:auto!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;border:0;padding:12px 0 0}
.cg-ad-card .cg-metrics>div{padding:0;border:0}.cg-ad-card .cg-metrics dt{font-size:11px;margin-bottom:3px}.cg-ad-card .cg-metrics dd{font-size:16px}
.cg-view-ad{display:flex;justify-content:space-between;align-items:center;background:transparent;border:0;border-top:1px solid #f6f2ef;border-radius:0;font:inherit;font-size:12px;font-weight:600;color:#342d33;cursor:pointer;padding:12px 0 0;margin-top:4px}
.cg-no-media{height:100%;min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#70676e;padding:20px;text-align:center;background:#f6f2ef}
.cg-no-media>span{font-size:32px;line-height:1}.cg-no-media p{font-size:12px;line-height:1.5;margin:8px 0 0}
.cg-set-summary{margin:0 24px 18px;padding:16px;border:1px solid #e5dfe2;border-radius:10px;background:#fdfbfa}
.cg-set-summary>div{display:flex;justify-content:space-between;gap:10px}.cg-set-summary h4{font-size:15px;margin:0 0 10px}
.cg-set-summary .cg-metrics>div{padding:12px 12px 12px 0}.cg-set-summary .cg-metrics{border:0;margin:10px 0!important}
.cg-set-summary .cg-metrics dd{font-size:18px}.cg-set-summary .cg-metrics>div{border:0}
.cg-set-summary>dl:not(.cg-metrics),.cg-ad-info dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 22px;margin:12px 0}
.cg-set-summary dt,.cg-ad-info dt{font-size:12px;color:#70676e}.cg-set-summary dd,.cg-ad-info dd{margin:2px 0 0;font-size:13px;color:#342d33;white-space:pre-wrap;overflow-wrap:anywhere}
.cg-notes{padding:10px 24px 0}.cg-note{font-size:12px;line-height:1.55;color:#8a662a;margin:8px 0}
.cg-empty{padding:18px 24px;color:#70676e;font-size:13px}
.cg-dialog{color:#242124;font:14px/1.6 "Poppins",sans-serif;padding:0;border:0;border-radius:16px 0 0 16px;width:min(1040px,94vw);height:100dvh;max-width:none;max-height:100dvh;margin:0 0 0 auto;box-shadow:-12px 0 60px #24212429}
.cg-dialog::backdrop{background:#24212466;backdrop-filter:blur(3px)}
.cg-sheet{height:100%;overflow:auto}.cg-sheet-head{position:sticky;top:0;z-index:1;background:#fff;border-bottom:1px solid #f6f2ef;padding:22px 28px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.cg-sheet-head p{font-size:12px;margin:0 0 6px;color:#70676e}.cg-sheet-head h3{font-size:21px;font-weight:600;margin:0;line-height:1.4;color:#242124}
.cg-sheet-head button{background:#f6f2ef;color:#574e55;border:0;border-radius:50%;font-size:26px;line-height:1;width:34px;height:34px;flex-shrink:0;cursor:pointer;padding:0}
.cg-sheet-body{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);gap:26px;padding:28px}
.cg-full-media{min-width:0}.cg-full-media figure{margin:0 0 18px;background:#f6f2ef;border-radius:10px;overflow:hidden}
.cg-full-media img,.cg-full-media video{width:100%;display:block;max-height:65vh;object-fit:contain}
.cg-full-media figcaption{font-size:12px;line-height:1.5;padding:10px;color:#70676e}.cg-ad-info{min-width:0}
.cg-ad-info section{margin:20px 0;padding:0}.cg-ad-info h4{font-size:13px;font-weight:600;color:#342d33;margin:0 0 9px}.cg-copy p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 12px;font-size:14px;line-height:1.65}
.cg-cta{display:inline-block;padding:5px 9px;background:#f6f2ef;font-size:12px;border-radius:5px}.cg-links{display:flex;flex-wrap:wrap;gap:12px}.cg-links a{font-size:12px;color:#342d33}
.cg-set-name{font-size:12px;color:#70676e}.cg-technical{border-top:1px solid #e5dfe2;padding:16px 0}.cg-technical summary{font-size:12px;color:#70676e;cursor:pointer}.cg-technical pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;color:#70676e}
.cg-daily-scroll{overflow-x:auto}.cg-daily-scroll table{width:100%;border-collapse:collapse;font-size:11px}.cg-daily-scroll td,.cg-daily-scroll th{padding:5px;text-align:left;border-bottom:1px solid #f6f2ef}
.cg-print-poster{display:none!important}.cg-ad-card[hidden],.cg-set-summary[hidden]{display:none!important}
.cg-adset-tabs button:focus-visible,.cg-ad-heading button:focus-visible,.cg-view-ad:focus-visible,.cg-preview-button:focus-visible{outline:2px solid #c51246;outline-offset:-3px}
@media(max-width:1000px){.cg-ad-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cg-sheet-body{grid-template-columns:1fr}.cg-full-media figure{max-width:520px;margin-left:auto;margin-right:auto}}
@media(max-width:620px){.cg-campaign-head{padding:18px}.cg-campaign-head h3{font-size:17px}.cg-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.cg-metrics>div{padding:12px 18px;border-right:0}.cg-metrics dd{font-size:20px}.cg-ad-grid{grid-template-columns:1fr;padding:0 18px 18px}.cg-adset-tabs{padding-left:18px;padding-right:18px}.cg-set-summary{margin-left:18px;margin-right:18px}.cg-dialog{width:100vw;border-radius:0}.cg-sheet-head,.cg-sheet-body{padding:18px}}
@media print{.cg-campaign{overflow:visible;break-inside:auto}.cg-adset-tabs,.cg-view-ad,.cg-sheet-head button{display:none!important}.cg-ad-card[hidden],.cg-set-summary[hidden]{display:block!important}.cg-card-copy{-webkit-line-clamp:unset}.cg-dialog{display:block!important;position:static;width:100%;height:auto;max-height:none;border:1px solid #e5dfe2;box-shadow:none;margin:15px 0;border-radius:8px;break-before:page}.cg-sheet{height:auto;overflow:visible}.cg-sheet-head{position:static}.cg-sheet-body{grid-template-columns:1fr 1fr}.cg-full-media video,.cg-card-media video{display:none}.cg-print-poster{display:block!important}.cg-ad-card{break-inside:avoid}.cg-ad-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cg-technical::details-content{content-visibility:visible}}
`;
