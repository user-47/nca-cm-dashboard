import type { TemplateProps } from "../registry";
import { formatLongDate } from "../../lib/format";
import { Motifs } from "../../components/Motifs";
import { TexturedText } from "../../components/TexturedText";

/**
 * Sermon series.
 *
 * A title card, not a photograph with words on it. The series title carries the
 * whole poster: set very large in the brand's display face, filled with grain
 * when the brand asks for it, over a background dimmed and desaturated hard
 * enough that nothing competes with it.
 *
 * An optional cutout — a speaker portrait with its background removed — sits
 * between the artwork and the type, which is the layering the reference posters
 * use and the reason `cutout` exists as its own slot type.
 */
export default function SermonSeries({
  params,
  tokens,
  brand,
  width,
  height,
}: TemplateProps) {
  const seriesTitle = params.seriesTitle?.trim() || "";
  const part = params.part?.trim();
  const speaker = params.speaker?.trim();
  const hero = params.hero?.trim();
  const portrait = params.portrait?.trim();
  const date = formatLongDate(params.date);

  const rootPx = (Math.min(width, height) / 1080) * 16;

  // The display face decides how much room the title needs. A heavy poster face
  // sets far wider than an editorial serif at the same pixel size, so sizing on
  // character count alone overflows the frame. Fit to the available width
  // instead, using the face's average advance as a fraction of its font size.
  //
  // These ratios are measured from the shipped faces, not guessed: Alfa Slab One
  // and Anton average ~0.78em per character in caps, Spectral ~0.55em in mixed
  // case. Deliberately arithmetic rather than measured in the browser — a
  // layout that depends on measurement is a layout that can render differently
  // twice, and renders have to stay byte-identical.
  const posterFace = /poster|heavy|black|caps/.test(tokens.fonts.display);
  const ceiling = (posterFace ? 112 : 128) * (rootPx / 16);
  const perChar = posterFace ? 0.78 : 0.55;

  const padX = 4.5 * rootPx; // matches the lockup's horizontal padding below
  const avail = width - padX * 2;

  // A title may wrap to two lines, but a single word cannot break, so the
  // longest word sets the hard limit on how large the whole title can go.
  const words = seriesTitle.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((n, w) => Math.max(n, w.length), 0);
  const lines = seriesTitle.length > 20 ? 2 : 1;
  const perLine = Math.max(longestWord, Math.ceil(seriesTitle.length / lines));

  const titleSize = Math.min(ceiling, avail / (perLine * perChar));

  // Grain in the brand means grain in the letterforms too.
  const grainy =
    tokens.motifs.includes("grain") || tokens.motifs.includes("paper-grain");

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "var(--brand-ink)",
        fontSize: `${rootPx}px`,
      }}
    >
      {hero ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "grayscale(0.55) contrast(1.15) brightness(0.55)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.74) 30%, rgba(0,0,0,0.34) 54%, rgba(0,0,0,0.58) 82%, rgba(0,0,0,0.88) 100%)",
            }}
          />
        </>
      ) : null}

      {/* Texture over the artwork, under everything that carries meaning. */}
      <Motifs motifs={tokens.motifs} color="var(--brand-on-primary)" />

      {portrait ? (
        // Anchored to the bottom edge so a waist-up cutout reads as standing in
        // the frame rather than floating in it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={portrait}
          alt=""
          style={{
            position: "absolute",
            right: "4%",
            bottom: 0,
            height: "62%",
            width: "auto",
            objectFit: "contain",
            objectPosition: "bottom",
            filter: "drop-shadow(0 0 2.5em rgba(0,0,0,0.55))",
          }}
        />
      ) : null}

      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // The title sits in the upper-middle with the supporting detail under
          // it, rather than everything stacking against the bottom edge. A
          // bottom-anchored lockup reads as a caption on a photograph; a poster
          // wants its title carrying the frame.
          justifyContent: "flex-start",
          textAlign: "center",
          padding: "9em 4.5em 5em",
        }}
      >
        {/* The church's mark, or its name when no logo is set. */}
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.name}
            style={{
              position: "absolute",
              top: "3.2em",
              left: "50%",
              transform: "translateX(-50%)",
              height: "3.4em",
              width: "auto",
              objectFit: "contain",
            }}
          />
        ) : (
          <span
            style={{
              position: "absolute",
              top: "3.6em",
              left: "50%",
              transform: "translateX(-50%)",
              fontFamily: "var(--brand-font-body)",
              fontWeight: 600,
              fontSize: "1.2em",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--brand-accent)",
              opacity: 0.9,
              whiteSpace: "nowrap",
            }}
          >
            {brand.name}
          </span>
        )}

        {part ? (
          <span
            style={{
              marginBottom: "1.6em",
              padding: "0.55em 1.5em",
              borderRadius: "var(--brand-radius-pill)",
              border: "0.1em solid var(--brand-accent)",
              fontFamily: "var(--brand-font-mono, var(--brand-font-body))",
              fontSize: "1.35em",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--brand-accent)",
            }}
          >
            {part}
          </span>
        ) : null}

        <TexturedText
          as="h1"
          textured={grainy}
          color="var(--brand-accent)"
          style={{
            margin: 0,
            fontFamily: "var(--brand-font-display)",
            fontWeight: 600,
            fontSize: `${titleSize}px`,
            lineHeight: posterFace ? 0.92 : 1.02,
            letterSpacing: posterFace ? "-0.005em" : "-0.025em",
            textTransform: posterFace ? "uppercase" : "none",
            textWrap: "balance",
          }}
        >
          {seriesTitle}
        </TexturedText>

        {speaker || date ? (
          <p
            style={{
              margin: "1.6em 0 0",
              fontFamily: "var(--brand-font-body)",
              fontWeight: 500,
              fontSize: "1.55em",
              letterSpacing: "0.05em",
              color: "var(--brand-on-primary)",
              opacity: 0.88,
              whiteSpace: "pre",
            }}
          >
            {[speaker, date].filter(Boolean).join("   ·   ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
