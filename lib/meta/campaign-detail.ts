import { fetchAllPages, fetchGraph } from "./read";
import { metrics, type Metrics, type Window } from "../reports/model";

type Fields = Record<string, unknown>;
const object = (value: unknown): Fields =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Fields)
    : {};
const list = (value: unknown): Fields[] =>
  Array.isArray(value) ? value.map(object) : [];
const words = (value: unknown) => (typeof value === "string" ? value : "");
function url(value: unknown) {
  try {
    const u = new URL(words(value));
    if (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.searchParams.has("access_token")
    )
      return u.href;
  } catch {
    /* Metadata can omit URLs. */
  }
  return "";
}
export function budget(value: unknown, currency: string) {
  if (!value || !Number.isFinite(Number(value)) || !currency) return "";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(
    Number(value) /
      10 **
        (new Intl.NumberFormat("en", {
          style: "currency",
          currency,
        }).resolvedOptions().maximumFractionDigits ?? 2),
  );
}
export function limitation(label: string, error: unknown) {
  const e = error as { code?: number; status?: number; message?: string };
  if (
    [10, 190, 200, 294].includes(e.code ?? 0) ||
    e.status === 403 ||
    /permission|requires.*access/i.test(e.message || "")
  )
    return label + " · Meta denied access for this connection.";
  if ([4, 17, 32, 613, 80004].includes(e.code ?? 0) || e.status === 429)
    return label + " · Meta rate limit reached.";
  if (e.code === 100)
    return label + " · Meta could not return the requested object or fields.";
  return label + " · Meta data unavailable on this read.";
}
export type Asset = {
  kind: string;
  image?: string;
  hash?: string;
  videoId?: string;
  video?: string;
  title?: string;
  copy?: string;
  link?: string;
  cta?: string;
};
export type Creative = {
  id: string;
  copy: string[];
  titles: string[];
  descriptions: string[];
  links: string[];
  ctas: string[];
  assets: Asset[];
  post: string;
  notes: string[];
};
export function creative(raw: Fields): Creative {
  const spec = object(raw.object_story_spec),
    feed = object(raw.asset_feed_spec);
  const link = object(spec.link_data),
    video = object(spec.video_data),
    photo = object(spec.photo_data);
  const unique = (values: unknown[]) =>
    Array.from(new Set(values.map(words).filter(Boolean)));
  const assets: Asset[] = [];
  function add(o: Fields, kind: string) {
    const item: Asset = {
      kind,
      image: url(o.image_url || o.picture || o.url),
      hash: words(o.image_hash || o.hash),
      videoId: words(o.video_id),
      title: words(o.name || o.title),
      copy: words(o.description),
      link: url(o.link),
      cta: words(object(o.call_to_action).type),
    };
    if (Object.values(item).slice(1).some(Boolean)) assets.push(item);
  }
  list(link.child_attachments).forEach((card) => add(card, "Carousel card"));
  if (video.video_id || raw.video_id)
    add({ ...video, video_id: video.video_id || raw.video_id }, "Video");
  list(feed.images).forEach((i) => add(i, "Image variant"));
  list(feed.videos).forEach((v) => add(v, "Video variant"));
  if (photo.image_hash || link.image_hash || raw.image_url || raw.image_hash)
    add(
      {
        image_hash: photo.image_hash || link.image_hash || raw.image_hash,
        image_url: raw.image_url || link.picture,
      },
      "Image",
    );
  const thumbnail = url(raw.thumbnail_url);
  if (thumbnail && !assets.some((a) => a.image))
    assets.push({ kind: "Meta thumbnail", image: thumbnail });
  const postId = words(raw.effective_object_story_id);
  return {
    id: words(raw.id),
    copy: unique([
      raw.body,
      link.message,
      video.message,
      photo.caption,
      ...list(feed.bodies).map((o) => o.text),
    ]),
    titles: unique([
      raw.title,
      link.name,
      video.title,
      ...list(feed.titles).map((o) => o.text),
    ]),
    descriptions: unique([
      link.description,
      video.link_description,
      ...list(feed.descriptions).map((o) => o.text),
    ]),
    ctas: unique([
      object(link.call_to_action).type,
      object(video.call_to_action).type,
      ...(Array.isArray(feed.call_to_action_types)
        ? feed.call_to_action_types
        : []),
    ]),
    links: unique(
      [
        link.link,
        object(object(video.call_to_action).value).link,
        ...list(feed.link_urls).map((o) => o.website_url),
      ].map(url),
    ),
    assets,
    post:
      url(raw.instagram_permalink_url) ||
      (/^\d+_\d+$/.test(postId) ? "https://www.facebook.com/" + postId : ""),
    notes: Object.keys(feed).length
      ? [
          "Meta provides eligible creative variants. Results belong to the ad as a whole.",
        ]
      : [],
  };
}
export type Ad = {
  id: string;
  name: string;
  status: string;
  creative: Creative;
  stats?: Metrics;
  days?: {
    day: string;
    ctr: string;
    cpc: string;
    frequency: string;
    impressions: string;
  }[];
};
export type AdSet = {
  id: string;
  name: string;
  status: string;
  settings: Record<string, string>;
  targeting?: Fields;
  stats?: Metrics;
  ads: Ad[];
};
export type CampaignDetail = { sets: AdSet[]; notes: string[] };
export type DetailMap = Record<string, CampaignDetail>;
const statFields =
  "campaign_id,adset_id,spend,impressions,reach,frequency,clicks,ctr,cpc,actions,action_values,purchase_roas,video_thruplay_watched_actions";
const creativeFields =
  "id,body,title,thumbnail_url,image_hash,image_url,video_id,object_story_spec,asset_feed_spec,effective_object_story_id,instagram_permalink_url";
function audienceSettings(target: Fields): Record<string, string> {
  const locations = (value: unknown) =>
    Object.entries(object(value))
      .map(([kind, values]) => {
        const names = Array.isArray(values)
          ? values
              .map((v) => {
                if (typeof v === "string") return v;
                const item = object(v);
                return [
                  item.name || item.key,
                  item.region,
                  item.country,
                  item.radius
                    ? String(item.radius) +
                      " " +
                      words(item.distance_unit) +
                      " radius"
                    : "",
                ]
                  .filter(Boolean)
                  .join(", ");
              })
              .join(" · ")
          : String(values);
        return kind.replaceAll("_", " ") + " · " + names;
      })
      .join("\n");
  const arrays = (value: unknown) =>
    Array.isArray(value) ? value.map(String).join(", ") : "";
  return {
    Age:
      target.age_min || target.age_max
        ? String(target.age_min || "Unreported") +
          "–" +
          String(target.age_max || "Unreported")
        : "",
    Gender: Array.isArray(target.genders)
      ? target.genders
          .map((v) => ["All", "Men", "Women"][Number(v)] || String(v))
          .join(", ")
      : "",
    "Included locations": locations(target.geo_locations),
    "Excluded locations": locations(target.excluded_geo_locations),
    Platforms: arrays(target.publisher_platforms),
    "Facebook placements": arrays(target.facebook_positions),
    "Instagram placements": arrays(target.instagram_positions),
    Devices: arrays(target.device_platforms),
  };
}
export async function readDetails(
  account: string,
  currency: string,
  ids: string[],
  periods: (Window | "last_7d" | "last_30d")[],
  dailyTrends = false,
): Promise<DetailMap[]> {
  const output = periods.map(
    () =>
      Object.fromEntries(
        ids.map((id) => [id, { sets: [] as AdSet[], notes: [] as string[] }]),
      ) as DetailMap,
  );
  for (let start = 0; start < ids.length; start += 40) {
    const group = ids.slice(start, start + 40),
      notes = new Set<string>();
    const filtering = JSON.stringify([
      { field: "campaign.id", operator: "IN", value: group },
    ]);
    const params = { filtering, limit: "100" };
    async function optional<T>(
      label: string,
      call: () => Promise<T>,
      fallback: T,
    ) {
      try {
        return await call();
      } catch (e) {
        notes.add(limitation(label, e));
        return fallback;
      }
    }
    const sets = await optional(
      "Ad set settings",
      () =>
        fetchAllPages<Fields>(account + "/adsets", {
          ...params,
          fields:
            "id,campaign_id,name,effective_status,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,targeting,attribution_spec",
        }),
      [],
    );
    let ads: Fields[];
    try {
      ads = await fetchAllPages<Fields>(account + "/ads", {
        ...params,
        fields:
          "id,campaign_id,adset_id,name,effective_status,creative{" +
          creativeFields +
          "}",
      });
    } catch (e) {
      notes.add(limitation("Full creative fields", e));
      ads = await optional(
        "Ad inventory",
        () =>
          fetchAllPages<Fields>(account + "/ads", {
            ...params,
            fields:
              "id,campaign_id,adset_id,name,effective_status,creative{id,title,body,thumbnail_url}",
          }),
        [],
      );
    }
    const creatives = new Map(
      ads.map((a) => [words(a.id), creative(object(a.creative))]),
    );
    const allAssets = Array.from(creatives.values()).flatMap((c) => c.assets);
    const hashes = Array.from(
      new Set(allAssets.map((a) => a.hash).filter((h): h is string => !!h)),
    );
    for (let i = 0; i < hashes.length; i += 40) {
      const images = await optional(
        "Full-size images",
        () =>
          fetchAllPages<Fields>(account + "/adimages", {
            hashes: JSON.stringify(hashes.slice(i, i + 40)),
            fields: "hash,url",
            limit: "100",
          }),
        [],
      );
      const urls = new Map(images.map((v) => [words(v.hash), url(v.url)]));
      for (const a of allAssets)
        if (a.hash && urls.get(a.hash)) a.image = urls.get(a.hash);
    }
    const videoIds = Array.from(
      new Set(
        allAssets
          .map((a) => a.videoId)
          .filter((v): v is string => !!v && /^\d+$/.test(v)),
      ),
    );
    for (let i = 0; i < videoIds.length; i += 4)
      await Promise.all(
        videoIds.slice(i, i + 4).map(async (id) => {
          try {
            const v = await fetchGraph(id, { fields: "source,picture" });
            for (const a of allAssets)
              if (a.videoId === id) {
                a.video = url(v.source);
                a.image ||= url(v.picture);
              }
          } catch (e) {
            for (const c of creatives.values())
              if (c.assets.some((a) => a.videoId === id))
                c.notes.push(limitation("Video playback", e));
          }
        }),
      );
    // Boosted posts can keep their copy and media on the Page post instead of the ad creative.
    const posts = new Map<string, Creative[]>();
    for (const a of ads) {
      const c = creatives.get(words(a.id))!,
        post = words(object(a.creative).effective_object_story_id);
      if (
        /^\d+_\d+$/.test(post) &&
        (!c.copy.length || !c.assets.some((v) => v.kind !== "Meta thumbnail"))
      )
        posts.set(post, [...(posts.get(post) || []), c]);
    }
    const postEntries = Array.from(posts);
    for (let i = 0; i < postEntries.length; i += 4)
      await Promise.all(
        postEntries.slice(i, i + 4).map(async ([id, items]) => {
          try {
            const post = await fetchGraph(id, {
              fields:
                "message,permalink_url,attachments{media_type,media,title,description,url,subattachments}",
            });
            for (const c of items) {
              if (!c.copy.length && words(post.message))
                c.copy.push(words(post.message));
              c.post ||= url(post.permalink_url);
              for (const root of list(object(post.attachments).data)) {
                const children = list(object(root.subattachments).data);
                for (const a of children.length ? children : [root]) {
                  const media = object(a.media);
                  c.assets.push({
                    kind: words(a.media_type) || "Post attachment",
                    image: url(object(media.image).src),
                    video: url(media.source),
                    title: words(a.title),
                    copy: words(a.description),
                    link: url(a.url),
                  });
                }
              }
            }
          } catch (e) {
            for (const c of items) c.notes.push(limitation("Original post", e));
          }
        }),
      );
    for (const [index, period] of periods.entries()) {
      const range: Record<string, string> =
        typeof period === "string"
          ? { date_preset: period }
          : {
              time_range: JSON.stringify({
                since: period.since,
                until: period.until,
              }),
              use_unified_attribution_setting: "true",
            };
      const periodNotes: string[] = [];
      async function insights(level: "ad" | "adset", daily = false) {
        const fields = daily
          ? "campaign_id,adset_id,ad_id,impressions,ctr,cpc,frequency"
          : statFields +
            (level === "ad" ? ",ad_id,ad_name,adset_name" : ",adset_name");
        try {
          return await fetchAllPages<Fields>(account + "/insights", {
            ...params,
            ...range,
            level,
            fields: fields + (daily ? "" : ",instagram_profile_visits"),
            ...(daily ? { time_increment: "1" } : {}),
          });
        } catch (e) {
          if (
            !daily &&
            e instanceof Error &&
            /instagram_profile_visits|not a valid.*field|invalid metric/i.test(
              e.message,
            )
          ) {
            periodNotes.push(
              "Instagram profile visits unavailable at " + level + " level.",
            );
            try {
              return await fetchAllPages<Fields>(account + "/insights", {
                ...params,
                ...range,
                level,
                fields,
              });
            } catch (fallbackError) {
              e = fallbackError;
            }
          }
          periodNotes.push(
            limitation(daily ? "Daily ad trends" : level + " metrics", e),
          );
          return [];
        }
      }
      const [setStats, adStats, days] = await Promise.all([
        insights("adset"),
        insights("ad"),
        dailyTrends ? insights("ad", true) : [],
      ]);
      const hierarchy = output[index],
        bySet = new Map<string, AdSet>(),
        byAd = new Map<string, Ad>();
      function setFor(campaignId: unknown, id: unknown, name: unknown) {
        const cid = words(campaignId),
          sid = words(id);
        if (!hierarchy[cid] || !sid) return;
        let set = bySet.get(sid);
        if (!set) {
          set = {
            id: sid,
            name: words(name) || sid,
            status: "Unreported",
            settings: {},
            ads: [],
          };
          bySet.set(sid, set);
          hierarchy[cid].sets.push(set);
        }
        return set;
      }
      for (const s of sets) {
        const set = setFor(s.campaign_id, s.id, s.name);
        if (!set) continue;
        set.status = words(s.effective_status);
        set.targeting = object(s.targeting);
        set.settings = Object.fromEntries(
          Object.entries({
            Optimization: words(s.optimization_goal),
            Billing: words(s.billing_event),
            "Bid strategy": words(s.bid_strategy),
            "Daily budget": budget(s.daily_budget, currency),
            "Lifetime budget": budget(s.lifetime_budget, currency),
            Starts: words(s.start_time),
            Ends: words(s.end_time),
            ...audienceSettings(object(s.targeting)),
            Attribution: s.attribution_spec
              ? JSON.stringify(s.attribution_spec)
              : "",
          }).filter(([, v]) => v),
        );
      }
      for (const r of setStats) {
        const set = setFor(r.campaign_id, r.adset_id, r.adset_name);
        if (set) set.stats = metrics(r);
      }
      function insertAd(row: Fields, id: string, name: unknown) {
        const set = setFor(row.campaign_id, row.adset_id, row.adset_name);
        if (!set || !id) return;
        let ad = byAd.get(id);
        if (!ad) {
          ad = {
            id,
            name: words(name) || id,
            status: words(row.effective_status) || "Unreported",
            creative: creatives.get(id) || creative({}),
          };
          byAd.set(id, ad);
          set.ads.push(ad);
        }
        return ad;
      }
      for (const a of ads) insertAd(a, words(a.id), a.name);
      for (const r of adStats) {
        const ad = insertAd(r, words(r.ad_id), r.ad_name);
        if (ad) ad.stats = metrics(r);
      }
      for (const r of days) {
        const ad = byAd.get(words(r.ad_id));
        if (ad)
          (ad.days ??= []).push({
            day: words(r.date_start),
            ctr: words(r.ctr),
            cpc: words(r.cpc),
            frequency: words(r.frequency),
            impressions: words(r.impressions),
          });
      }
      for (const id of group) hierarchy[id].notes = [...notes, ...periodNotes];
    }
  }
  return output;
}
