import type { Motif } from "@nca/brand-tokens";

/**
 * Decorative texture layers, drawn from a brand's `motifs`.
 *
 * These tokens have existed since the design system was written: declared in the
 * schema, read out of reference posters by the style extractor, stored on every
 * brand, and shown in the brand editor. Until now nothing drew them, which is
 * most of why a rendered poster reads flat next to a designed one. Grain in
 * particular is what makes a dark poster look printed rather than filled.
 *
 * Everything here is deterministic. Two renders of one poster must be
 * byte-identical, so the noise comes from SVG turbulence with a fixed seed
 * rather than anything random, and nothing animates.
 */

/** Distinct seeds so two grain layers in one poster do not moiré. */
const SEEDS: Partial<Record<Motif, number>> = {
  grain: 7,
  "paper-grain": 19,
  "spray-splatter": 31,
};

function Noise({
  motif,
  baseFrequency,
  opacity,
  blend,
}: {
  motif: Motif;
  baseFrequency: number;
  opacity: number;
  blend: string;
}) {
  const id = `noise-${motif}`;
  return (
    <svg
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity,
        mixBlendMode: blend as never,
        pointerEvents: "none",
      }}
    >
      <filter id={id}>
        <feTurbulence
          type="fractalNoise"
          baseFrequency={baseFrequency}
          numOctaves={3}
          seed={SEEDS[motif] ?? 1}
          stitchTiles="stitch"
        />
        {/* Turbulence is colourful; flatten it to luminance so it reads as
            paper tooth rather than as confetti. */}
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0.6 0.3 0.1 0 0"
        />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

/** One absolutely-positioned layer per motif, stacked over the artwork. */
function Layer({ motif }: { motif: Motif }) {
  const fill = (background: string, extra?: React.CSSProperties) => (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background,
        ...extra,
      }}
    />
  );

  switch (motif) {
    case "grain":
      return <Noise motif={motif} baseFrequency={0.8} opacity={0.16} blend="overlay" />;

    case "paper-grain":
      return <Noise motif={motif} baseFrequency={0.42} opacity={0.1} blend="soft-light" />;

    case "spray-splatter":
      return <Noise motif={motif} baseFrequency={0.16} opacity={0.12} blend="overlay" />;

    case "halftone-dots":
      // Fades out toward the middle so it decorates an edge instead of
      // sitting on top of the type.
      return fill(
        "radial-gradient(circle, currentColor 1px, transparent 1.6px) 0 0 / 10px 10px",
        {
          opacity: 0.14,
          maskImage:
            "linear-gradient(160deg, rgba(0,0,0,0.9) 0%, transparent 45%)",
          WebkitMaskImage:
            "linear-gradient(160deg, rgba(0,0,0,0.9) 0%, transparent 45%)",
        }
      );

    case "cross-etch":
      return fill(
        "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 7px)," +
          "repeating-linear-gradient(-45deg, currentColor 0 1px, transparent 1px 7px)",
        { opacity: 0.07 }
      );

    case "starfield":
      return fill(
        "radial-gradient(1.5px 1.5px at 18% 22%, currentColor, transparent)," +
          "radial-gradient(1px 1px at 62% 14%, currentColor, transparent)," +
          "radial-gradient(1.5px 1.5px at 84% 38%, currentColor, transparent)," +
          "radial-gradient(1px 1px at 32% 61%, currentColor, transparent)," +
          "radial-gradient(1.5px 1.5px at 71% 78%, currentColor, transparent)",
        { opacity: 0.5 }
      );

    case "mesh-gradient":
      return fill(
        "radial-gradient(60% 50% at 20% 15%, currentColor, transparent)," +
          "radial-gradient(50% 45% at 85% 30%, currentColor, transparent)," +
          "radial-gradient(55% 50% at 60% 90%, currentColor, transparent)",
        { opacity: 0.16, mixBlendMode: "soft-light" }
      );

    case "geometric-blocks":
      return fill(
        "linear-gradient(135deg, currentColor 0 12%, transparent 12%)," +
          "linear-gradient(-135deg, currentColor 0 8%, transparent 8%)",
        { opacity: 0.1 }
      );

    case "tape-strips":
      // Two strips at opposing corners, rotated, deliberately imperfect.
      return (
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {[
            { top: "-1.4em", left: "8%", rotate: "-6deg" },
            { bottom: "-1.4em", right: "12%", rotate: "4deg" },
          ].map((pos, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                width: "13em",
                height: "3.2em",
                background: "currentColor",
                opacity: 0.16,
                transform: `rotate(${pos.rotate})`,
                ...pos,
              }}
            />
          ))}
        </div>
      );

    case "torn-paper":
      // A ragged horizontal edge low in the frame.
      return (
        <div
          aria-hidden
          style={{
            position: "absolute",
            insetInline: 0,
            bottom: 0,
            height: "22%",
            background: "currentColor",
            opacity: 0.08,
            pointerEvents: "none",
            clipPath:
              "polygon(0 18%, 6% 9%, 13% 20%, 21% 7%, 29% 17%, 38% 6%, 47% 16%, 56% 5%, 65% 15%, 74% 6%, 83% 17%, 92% 8%, 100% 16%, 100% 100%, 0 100%)",
          }}
        />
      );

    case "sticker-text":
    case "hand-scribble":
      // These are content, not texture: they need a string or a path to draw,
      // which a background layer has no access to. Nothing rather than noise.
      return null;
  }
}

export function Motifs({
  motifs,
  color = "var(--brand-accent)",
}: {
  motifs: Motif[];
  /** Layers draw in currentColor, so one prop tints the whole set. */
  color?: string;
}) {
  if (motifs.length === 0) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        color,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {motifs.map((m) => (
        <Layer key={m} motif={m} />
      ))}
    </div>
  );
}
