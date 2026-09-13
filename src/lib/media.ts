/** Small, dependency-free helpers for inspecting media buffers. */

export function sniffMimeType(buffer: Buffer, fallback = "application/octet-stream"): string {
  const hex = buffer.subarray(0, 12).toString("hex");
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("47494638")) return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF") {
    const kind = buffer.subarray(8, 12).toString("ascii");
    if (kind === "WEBP") return "image/webp";
    if (kind === "WAVE") return "audio/wav";
  }
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  if (hex.startsWith("1a45dfa3")) return "video/webm";
  if (hex.startsWith("494433") || hex.startsWith("fffb") || hex.startsWith("fff3")) return "audio/mpeg";
  const head = buffer.subarray(0, 400).toString("utf8").trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return fallback;
}

export function kindFromMime(mimeType: string): "IMAGE" | "VIDEO" | "AUDIO" {
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  return "IMAGE";
}

/** Width/height for the formats we can read cheaply; undefined otherwise. */
export function imageDimensions(buffer: Buffer, mimeType: string): { width?: number; height?: number } {
  try {
    if (mimeType === "image/png" && buffer.length > 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mimeType === "image/jpeg") {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
    }
    if (mimeType === "image/svg+xml") {
      const head = buffer.subarray(0, 800).toString("utf8");
      const viewBox = head.match(/viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/);
      if (viewBox) return { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) };
      const w = head.match(/\bwidth=["'](\d+)/);
      const h = head.match(/\bheight=["'](\d+)/);
      if (w && h) return { width: Number(w[1]), height: Number(h[1]) };
    }
  } catch {
    // best effort only — dimensions are decoration, never correctness
  }
  return {};
}

/** Duration of a PCM WAV file, the one container we write ourselves. */
export function wavDurationMs(buffer: Buffer): number | undefined {
  try {
    if (buffer.subarray(0, 4).toString("ascii") !== "RIFF") return undefined;
    const byteRate = buffer.readUInt32LE(28);
    const dataSize = buffer.readUInt32LE(40);
    if (!byteRate) return undefined;
    return Math.round((dataSize / byteRate) * 1000);
  } catch {
    return undefined;
  }
}
