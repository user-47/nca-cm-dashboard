import type { ComponentType } from "react";
import type { BrandTokens, TemplateMeta } from "@nca/brand-tokens";
import { ANNOUNCEMENT, QUOTE_CARD, SERMON_SERIES } from "@nca/brand-tokens";
import QuoteCard from "./quote-card";
import Announcement from "./announcement";
import SermonSeries from "./sermon-series";

/**
 * Every prop a template receives.
 *
 * Templates get resolved params, the brand's tokens, and enough brand identity
 * to sign a poster. Nothing else. No database handle, no request, no clock: a
 * template is a pure function of its inputs, which is what makes two renders of
 * the same poster identical.
 */
export type TemplateProps = {
  params: Record<string, string | undefined>;
  tokens: BrandTokens;
  brand: { name: string; slug: string; logoUrl: string | null };
  width: number;
  height: number;
};

export type RegisteredTemplate = {
  meta: TemplateMeta;
  Component: ComponentType<TemplateProps>;
};

/**
 * Keyed by id then version, so v1 stays renderable after v2 lands and an old
 * poster keeps producing the picture it always did.
 */
export const REGISTRY: Record<string, Record<string, RegisteredTemplate>> = {
  "quote-card": {
    v1: { meta: QUOTE_CARD, Component: QuoteCard },
  },
  announcement: {
    v1: { meta: ANNOUNCEMENT, Component: Announcement },
  },
  "sermon-series": {
    v1: { meta: SERMON_SERIES, Component: SermonSeries },
  },
};

export function lookupTemplate(
  id: string,
  version = "v1"
): RegisteredTemplate | null {
  return REGISTRY[id]?.[version] ?? null;
}

export function listTemplates(): TemplateMeta[] {
  return Object.values(REGISTRY).flatMap((versions) =>
    Object.values(versions).map((t) => t.meta)
  );
}
