import { describe, expect, test } from "bun:test";

import { encodeIco } from "./ico.ts";

const png = (length: number, fill: number) => new Uint8Array(length).fill(fill);

describe("encodeIco", () => {
  const frames = [
    { size: 16, png: png(10, 0xa) },
    { size: 32, png: png(25, 0xb) },
  ];
  const ico = encodeIco(frames);
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

  test("header: reserved 0, type 1 (icon), frame count", () => {
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(2);
  });

  test("each entry: size, planes, bit count, length, offset", () => {
    const entry = (i: number) => 6 + 16 * i;
    expect([view.getUint8(entry(0)), view.getUint8(entry(0) + 1)]).toEqual([
      16, 16,
    ]);
    expect([view.getUint8(entry(1)), view.getUint8(entry(1) + 1)]).toEqual([
      32, 32,
    ]);
    expect(view.getUint16(entry(0) + 4, true)).toBe(1);
    expect(view.getUint16(entry(0) + 6, true)).toBe(32);
    expect(view.getUint32(entry(0) + 8, true)).toBe(10);
    expect(view.getUint32(entry(0) + 12, true)).toBe(6 + 32);
    expect(view.getUint32(entry(1) + 8, true)).toBe(25);
    expect(view.getUint32(entry(1) + 12, true)).toBe(6 + 32 + 10);
  });

  test("payloads are the input PNGs, byte for byte", () => {
    expect(ico.length).toBe(6 + 32 + 10 + 25);
    expect(ico.slice(38, 48)).toEqual(frames[0]!.png);
    expect(ico.slice(48)).toEqual(frames[1]!.png);
  });

  test("256 is stored as 0", () => {
    const big = encodeIco([{ size: 256, png: png(4, 1) }]);
    expect(big[6]).toBe(0);
    expect(big[7]).toBe(0);
  });
});
