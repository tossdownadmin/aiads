type Fields = Record<string, unknown>;
const object = (value: unknown): Fields => value && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const list = (value: unknown): Fields[] => Array.isArray(value) ? value.map(object) : [];

function mediaUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    if (url.protocol === 'https:' && !url.username && !url.password && !Array.from(url.searchParams.keys()).some(key => key.toLowerCase() === 'access_token')) return url.href;
  } catch { /* Creatives do not always expose media. */ }
  return '';
}

/** Presentation only: works with an account creative or an ad's nested creative. */
export function creativePreview(value: unknown) {
  const record = object(value);
  const raw = record.creative && typeof record.creative === 'object' ? object(record.creative) : record;
  const spec = object(raw.object_story_spec), feed = object(raw.asset_feed_spec);
  const link = object(spec.link_data), video = object(spec.video_data), photo = object(spec.photo_data);
  const carousel = list(link.child_attachments);
  const videos = list(feed.videos), images = list(feed.images);
  const candidates = [raw.image_url, link.picture, video.image_url, photo.image_url, photo.url,
    ...carousel.flatMap(card => [card.picture, card.image_url]),
    ...images.flatMap(image => [image.url, image.image_url]),
    ...videos.map(item => item.thumbnail_url), raw.thumbnail_url];
  const urls = [...new Set(candidates.map(mediaUrl).filter(Boolean))];
  const format = carousel.length ? 'Carousel' : raw.video_id || video.video_id || videos.length ? 'Video' : urls.length || raw.image_hash || link.image_hash || photo.image_hash || images.length ? 'Image' : 'Creative';
  return {
    images: urls,
    format,
    copy: text(raw.body) || text(link.message) || text(video.message) || text(photo.caption) || text(list(feed.bodies)[0]?.text),
    headline: text(raw.title) || text(link.name) || text(video.title) || text(list(feed.titles)[0]?.text),
  };
}
