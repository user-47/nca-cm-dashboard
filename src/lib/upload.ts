"use client";

/**
 * Browser-side upload. The file goes straight to MinIO on a presigned PUT,
 * then the app is told about it. Nothing large passes through Next.
 */

export type UploadedAsset = {
  id: string;
  filename: string;
  url: string;
  /** The MinIO object key. Portable, unlike the presigned url beside it. */
  minioKey: string;
  metaJson: Record<string, unknown>;
};

export type AssetKind = "audio" | "image" | "video" | "poster";

/**
 * Measures an audio or video file in the browser. Doing this here means a
 * section card can take its true width on the strip the moment the upload
 * lands, without waiting for a pipeline to ffprobe it.
 */
export function probeDuration(file: File): Promise<number | null> {
  if (!/^(audio|video)\//.test(file.type)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(
      file.type.startsWith("audio/") ? "audio" : "video"
    );
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const seconds = el.duration;
      done(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null);
    };
    // A codec the browser cannot read is not an error here. The pipeline
    // will ffprobe it, and the card stays at its placeholder width until then.
    el.onerror = () => done(null);
    el.src = url;
  });
}

export async function uploadAsset(
  file: File,
  kind: AssetKind,
  onProgress?: (percent: number) => void
): Promise<UploadedAsset> {
  const contentType = file.type || "application/octet-stream";

  const signRes = await fetch("/api/assets/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentType,
      sizeBytes: file.size,
    }),
  });
  if (!signRes.ok) throw new Error(await errorFrom(signRes));
  const { uploadUrl, key } = (await signRes.json()) as {
    uploadUrl: string;
    key: string;
  };

  const durationMs = await probeDuration(file);
  await putWithProgress(uploadUrl, file, contentType, onProgress);

  const confirmRes = await fetch("/api/assets/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key,
      kind,
      filename: file.name,
      contentType,
      ...(durationMs ? { durationMs } : {}),
    }),
  });
  if (!confirmRes.ok) throw new Error(await errorFrom(confirmRes));

  return (await confirmRes.json()) as UploadedAsset;
}

/** XHR rather than fetch, because fetch cannot report upload progress. */
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (${xhr.status}).`));
    xhr.onerror = () =>
      reject(new Error("The upload could not reach storage. Check your connection."));
    xhr.send(file);
  });
}

async function errorFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error ?? `That request failed (${res.status}).`;
}
