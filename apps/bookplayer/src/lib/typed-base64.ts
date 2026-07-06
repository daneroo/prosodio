/**
 * Base64 codecs for typed-array columns shipped over the wire (plan
 * thoughts/plans/bookplayer-align.md, D7/P2 + Phase 7c). Payloads compact as
 * columnar little-endian typed arrays rather than fat per-item JSON — this
 * module is the shared codec both epub-locator.ts (Uint32 DOM locator
 * columns) and alignment.ts (Float32/Int32 token columns) build on.
 */

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** base64-decoded bytes always start at a fresh buffer offset 0, but a
 * multi-byte typed array view still requires its *own* aligned backing
 * buffer — copying guards against any future caller slicing the Uint8Array
 * before viewing it. */
function decodeBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeUint32(values: Uint32Array): string {
  return encodeBytes(
    new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
  );
}

export function decodeUint32(base64: string): Uint32Array {
  const bytes = decodeBytes(base64);
  return new Uint32Array(bytes.buffer, 0, bytes.length / 4);
}

export function encodeInt32(values: Int32Array): string {
  return encodeBytes(
    new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
  );
}

export function decodeInt32(base64: string): Int32Array {
  const bytes = decodeBytes(base64);
  return new Int32Array(bytes.buffer, 0, bytes.length / 4);
}

export function encodeFloat32(values: Float32Array): string {
  return encodeBytes(
    new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
  );
}

export function decodeFloat32(base64: string): Float32Array {
  const bytes = decodeBytes(base64);
  return new Float32Array(bytes.buffer, 0, bytes.length / 4);
}
