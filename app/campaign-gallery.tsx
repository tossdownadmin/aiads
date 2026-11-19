"use client";

import { useEffect, useRef } from "react";
import type { DetailMap } from "../lib/meta/campaign-detail";
import {
  campaignCards,
  detailStyles,
  installGallery,
  type GalleryCampaign,
} from "../lib/reports/detail-view";

export default function CampaignGallery({
  campaigns,
  details,
  currency,
  scope,
}: {
  campaigns: GalleryCampaign[];
  details?: DetailMap;
  currency: string;
  scope: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const html = campaignCards(campaigns, details, currency, scope);
  useEffect(() => {
    if (root.current) return installGallery(root.current);
  }, [html]);
  return (
    <>
      <style>{detailStyles}</style>
      <div ref={root} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
