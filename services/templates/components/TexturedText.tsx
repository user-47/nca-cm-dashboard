import type { CSSProperties, ElementType, ReactNode } from "react";

/**
 * Type with the texture painted into the letterforms.
 *
 * The reference posters this was built for get their letterpress quality from
 * the grain sitting *inside* the type, not just over the artwork. That is a
 * masked fill: a noise image clipped to the glyphs with background-clip, over
 * the flat colour.
 *
 * The noise is a fixed inline SVG data URI rather than a generated one, so the
 * bytes are identical on every render.
 */

/** feTurbulence at a fixed seed, pre-encoded. Deterministic by construction. */
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0.5 0.4 0.2 0 0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23g)'/%3E%3C/svg%3E\")";

export function TexturedText({
  as: Tag = "span",
  children,
  color = "var(--brand-accent)",
  textured = true,
  strength = 0.55,
  style,
}: {
  as?: ElementType;
  children: ReactNode;
  color?: string;
  /** Off falls back to a flat fill, so a brand with no grain still reads well. */
  textured?: boolean;
  /** How much of the noise shows through, 0 to 1. */
  strength?: number;
  style?: CSSProperties;
}) {
  if (!textured) {
    return <Tag style={{ color, ...style }}>{children}</Tag>;
  }

  return (
    <Tag
      style={{
        // The flat colour sits underneath; the noise is composited over it and
        // the pair is then clipped to the glyphs.
        backgroundColor: color,
        backgroundImage: GRAIN_URI,
        backgroundBlendMode: "overlay",
        backgroundSize: "120px 120px",
        opacity: 0.35 + strength * 0.65,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        // Chromium needs a paint context for background-clip: text to survive
        // a screenshot cleanly.
        WebkitTextFillColor: "transparent",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
