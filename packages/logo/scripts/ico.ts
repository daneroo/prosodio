/**
 * An ICO file holding PNG frames (supported since Windows Vista). Layout:
 * https://en.wikipedia.org/wiki/ICO_(file_format) — a 6-byte ICONDIR, one
 * 16-byte ICONDIRENTRY per frame, then the PNG files. Little-endian.
 */
export function encodeIco(
  frames: ReadonlyArray<{ size: number; png: Uint8Array }>,
): Uint8Array {
  const headerLength = 6 + 16 * frames.length;
  const total = frames.reduce((sum, { png }) => sum + png.length, headerLength);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, frames.length, true);
  let offset = headerLength;
  frames.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    const dimension = size >= 256 ? 0 : size; // 0 means 256
    view.setUint8(entry, dimension); // width
    view.setUint8(entry + 1, dimension); // height
    view.setUint16(entry + 4, 1, true); // planes
    view.setUint16(entry + 6, 32, true); // bit count
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}
