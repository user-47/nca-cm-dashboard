"use client";

import { isImageSlot, type TemplateMeta, type TemplateSlot } from "@nca/brand-tokens";
import { Field, Input, Textarea, Select } from "@/components/ui/Field";
import { FileDrop } from "@/components/ui/FileDrop";

/**
 * The poster form, built from whatever the chosen template declares.
 *
 * There is deliberately no per-template form anywhere in this app. A template
 * says what slots it has and this renders one input each, so adding a template
 * is a template, not a template plus a form nobody remembers to update.
 */
export function SlotForm({
  template,
  values,
  onChange,
  templatesUrl,
  disabled,
}: {
  template: TemplateMeta;
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  /** Used only to show a thumbnail of an already-chosen image. */
  templatesUrl: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {template.slots.map((slot) => (
        <SlotInput
          key={slot.id}
          slot={slot}
          value={values[slot.id] ?? ""}
          onChange={(v) => onChange(slot.id, v)}
          templatesUrl={templatesUrl}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function SlotInput({
  slot,
  value,
  onChange,
  templatesUrl,
  disabled,
}: {
  slot: TemplateSlot;
  value: string;
  onChange: (value: string) => void;
  templatesUrl: string;
  disabled?: boolean;
}) {
  const id = `slot-${slot.id}`;
  const label = slot.required ? slot.label : `${slot.label} (optional)`;

  // Counting down only near the limit keeps the form quiet until it matters.
  const remaining = slot.max ? slot.max - value.length : null;
  const hint =
    remaining !== null && remaining <= 25
      ? `${remaining} characters left`
      : slot.hint;

  if (isImageSlot(slot.type)) {
    // The object key is stored, not the presigned URL: a presigned URL is
    // signed for the browser's address and the renderer cannot fetch it. The
    // templates app resolves keys through its own image route, which works from
    // both sides.
    const preview = value
      ? value.startsWith("http")
        ? value
        : `${templatesUrl}/api/image/${value}`
      : null;

    // A cutout is layered over the artwork rather than filling the frame, so a
    // photo with its background still on it comes out as a rectangle sitting on
    // the poster. The slot's own hint wins if the template wrote one.
    const cutoutHint =
      slot.hint ??
      "Use a PNG with the background removed, so it layers over the artwork.";

    return (
      <FileDrop
        kind="image"
        accept={slot.type === "cutout" ? "image/png,image/webp" : "image/*"}
        label={label}
        hint={slot.type === "cutout" ? cutoutHint : slot.hint}
        current={preview ? { filename: filenameFrom(value), url: preview } : null}
        disabled={disabled}
        onUploaded={(asset) => onChange(asset.minioKey)}
        onClear={() => onChange("")}
      />
    );
  }

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      {slot.type === "textarea" ? (
        <Textarea
          id={id}
          rows={3}
          value={value}
          maxLength={slot.max}
          placeholder={slot.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : slot.type === "select" ? (
        <Select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose one</option>
          {(slot.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={id}
          type={slot.type === "date" ? "date" : "text"}
          value={value}
          maxLength={slot.max}
          placeholder={slot.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/** Object keys carry a uuid prefix, so show the readable tail. */
function filenameFrom(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").pop() ?? "image";
    return decodeURIComponent(last.replace(/^[0-9a-f-]{36}-/, ""));
  } catch {
    return "image";
  }
}
