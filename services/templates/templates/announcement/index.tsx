import type { TemplateProps } from "../registry";
import { formatPosterDate } from "../../lib/format";

/**
 * Announcement.
 *
 * A photograph carrying a title lockup in the lower left, with the date and
 * place on a rule beneath it and the church's name quietly in the top corner.
 * The scrim is a gradient rather than a flat wash so the picture stays alive at
 * the top while the type below is guaranteed its contrast.
 */
export default function Announcement({
  params,
  brand,
  width,
  height,
}: TemplateProps) {
  const eyebrow = params.eyebrow?.trim();
  const title = params.title?.trim() || "";
  const location = params.location?.trim();
  const cta = params.cta?.trim();
  const hero = params.hero?.trim();
  const date = formatPosterDate(params.date);

  // One number scales the whole composition. See quote-card for why this is a
  // multiplier of 16 and not the raw ratio.
  const rootPx = (Math.min(width, height) / 1080) * 16;

  // Long titles step down rather than overflow.
  const titleSize = title.length > 44 ? 62 : title.length > 26 ? 76 : 92;

  const hasMeta = Boolean(date || location);

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
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.12) 32%, rgba(0,0,0,0.68) 74%, rgba(0,0,0,0.88) 100%)",
            }}
          />
        </>
      ) : null}

      {/* The church's name, small and out of the way. Signs the poster without
          competing with the announcement. */}
      <div
        style={{
          position: "absolute",
          top: "4.5em",
          right: "5em",
          display: "flex",
          alignItems: "center",
          gap: "0.9em",
        }}
      >
        <span
          style={{
            width: "0.28em",
            height: "1.8em",
            borderRadius: "var(--brand-radius-pill)",
            backgroundColor: "var(--brand-accent)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--brand-font-display)",
            fontWeight: 600,
            fontSize: "1.45em",
            color: "var(--brand-on-primary)",
            opacity: 0.92,
          }}
        >
          {brand.name}
        </span>
      </div>

      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "5em",
        }}
      >
        {eyebrow ? (
          <p
            style={{
              margin: "0 0 1.6em",
              fontFamily: "var(--brand-font-body)",
              fontWeight: 600,
              fontSize: "1.55em",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--brand-accent)",
            }}
          >
            {eyebrow}
          </p>
        ) : null}

        <h1
          style={{
            margin: 0,
            fontFamily: "var(--brand-font-display)",
            fontWeight: 600,
            fontSize: `${titleSize / 16}em`,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: "var(--brand-on-primary)",
            textWrap: "balance",
          }}
        >
          {title}
        </h1>

        {hasMeta ? (
          <div
            style={{
              marginTop: "1.8em",
              paddingTop: "1.5em",
              borderTop: "0.09em solid rgba(255,255,255,0.28)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "0.9em 2.2em",
            }}
          >
            {date ? (
              <span
                style={{
                  fontFamily: "var(--brand-font-mono, var(--brand-font-body))",
                  fontSize: "1.75em",
                  color: "var(--brand-on-primary)",
                }}
              >
                {date}
              </span>
            ) : null}
            {location ? (
              <span
                style={{
                  fontFamily: "var(--brand-font-body)",
                  fontSize: "1.75em",
                  color: "var(--brand-on-primary)",
                  opacity: 0.82,
                }}
              >
                {location}
              </span>
            ) : null}
          </div>
        ) : null}

        {cta ? (
          <p
            style={{
              margin: "2em 0 0",
              alignSelf: "flex-start",
              padding: "0.7em 1.4em",
              borderRadius: "var(--brand-radius-pill)",
              backgroundColor: "var(--brand-accent)",
              fontFamily: "var(--brand-font-body)",
              fontWeight: 600,
              fontSize: "1.5em",
              color: "var(--brand-ink)",
            }}
          >
            {cta}
          </p>
        ) : null}
      </div>
    </div>
  );
}
