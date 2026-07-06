import { describe, expect, test } from "bun:test";

import {
  decodeFloat32,
  decodeInt32,
  decodeUint32,
  encodeFloat32,
  encodeInt32,
  encodeUint32,
} from "./typed-base64.ts";

describe("typed-base64 round-trips", () => {
  test("Uint32", () => {
    const values = new Uint32Array([0, 1, 4294967295, 12345]);
    expect(decodeUint32(encodeUint32(values))).toEqual(values);
  });

  test("Int32, including negatives", () => {
    const values = new Int32Array([0, -1, 2147483647, -2147483648, -42]);
    expect(decodeInt32(encodeInt32(values))).toEqual(values);
  });

  test("Float32, including fractional values", () => {
    const values = new Float32Array([0, -1.5, 3.14159, 1e-3, -0.0001]);
    const decoded = decodeFloat32(encodeFloat32(values));
    expect(decoded.length).toBe(values.length);
    for (let i = 0; i < values.length; i++) {
      // Float32 round-trip through the *same* precision is exact (no
      // further truncation happens in encode/decode); Math.fround pins the
      // expected value to that precision for the comparison.
      expect(decoded[i]).toBe(Math.fround(values[i]!));
    }
  });

  test("empty arrays round-trip", () => {
    expect(decodeUint32(encodeUint32(new Uint32Array()))).toEqual(
      new Uint32Array(),
    );
    expect(decodeInt32(encodeInt32(new Int32Array()))).toEqual(
      new Int32Array(),
    );
    expect(decodeFloat32(encodeFloat32(new Float32Array()))).toEqual(
      new Float32Array(),
    );
  });
});
