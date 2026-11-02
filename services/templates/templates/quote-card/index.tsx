import type { TemplateProps } from "../registry";

/**
 * Quote card.
 *
 * An editorial pull-quote: large display serif, a brass rule marking the start,
 * attribution set small underneath. With a background image the type sits on a
 * scrim so it stays readable over anything; without one it sits on the brand's
 * primary colour.
 *
 * Sizing is in `em` off a root size derived from the frame's short edge, so the
 * same component reads correctly at 1:1, 4:5, and 9:16 without breakpoints. A
 * poster is not a responsive web page; it is one composition at several scales.
 */
export default function QuoteCard({ params, width, height }: TemplateProps) {
  const quote = params.quote?.trim() || "";
  const attribution = params.attribution?.trim();
  const hero = params.hero?.trim();

  /**
   * Root font size for the whole composition. Everything below is in `em`, so
   * this single number scales the entire layout and one component reads
   * correctly at every frame size without breakpoints.
   *
   * It keys off the *short* edge, so a tall 9:16 frame does not get absurdly
   * large text merely for being tall. 16px at a 1080px short edge is the
   * reference; a 540px preview halves everything.
   */
  const rootPx = (Math.min(width, height) / 1080) * 16;

  // Long quotes step down rather than overflow. Three bands is enough: past
  // ~180 characters the slot validator rejects it anyway.
  const quoteSize =
    quote.length > 120 ? 68 : quote.length > 70 ? 84 : 104;

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: hero ? "#000" : "var(--brand-primary)",
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
          {/* Scrim, not a flat overlay: keeps the image alive at the top while
              guaranteeing contrast where the type actually sits. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.78) 100%)",
            }}
          />
        </>
      ) : null}

      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "7em 6em",
        }}
      >
        {/* The one piece of brass on the poster. */}
        <div
          style={{
            width: "5em",
            height: "0.42em",
            borderRadius: "var(--brand-radius-pill)",
            backgroundColor: "var(--brand-accent)",
            marginBottom: "2.4em",
          }}
        />

        <blockquote
          style={{
            margin: 0,
            fontFamily: "var(--brand-font-display)",
            fontWeight: 600,
            fontSize: `${quoteSize / 16}em`,
            lineHeight: 1.16,
            letterSpacing: "-0.015em",
            color: "var(--brand-on-primary)",
            textWrap: "balance",
          }}
        >
          {quote}
        </blockquote>

        {attribution ? (
          <p
            style={{
              margin: "2.2em 0 0",
              fontFamily: "var(--brand-font-body)",
              fontWeight: 500,
              fontSize: "1.7em",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--brand-accent)",
            }}
          >
            {attribution}
          </p>
        ) : null}
      </div>
    </div>
  );
}
