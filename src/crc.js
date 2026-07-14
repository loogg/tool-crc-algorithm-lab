export const PRESETS = [
  { id: "crc8", name: "CRC-8 / SMBUS", width: 8, poly: 0x07, init: 0x00, xorOut: 0x00, refin: false, check: 0xf4 },
  { id: "maxim", name: "CRC-8 / MAXIM-DOW", width: 8, poly: 0x31, init: 0x00, xorOut: 0x00, refin: true, check: 0xa1 },
  { id: "ccitt", name: "CRC-16 / CCITT-FALSE", width: 16, poly: 0x1021, init: 0xffff, xorOut: 0x0000, refin: false, check: 0x29b1 },
  { id: "modbus", name: "CRC-16 / MODBUS", width: 16, poly: 0x8005, init: 0xffff, xorOut: 0x0000, refin: true, check: 0x4b37 },
];

export const maskFor = (width) => (width === 16 ? 0xffff : 0xff);
export const hex = (value, width, prefix = true) =>
  `${prefix ? "0x" : ""}${(value & maskFor(width)).toString(16).toUpperCase().padStart(width / 4, "0")}`;

export function reflectPoly(poly, width) {
  let reflected = 0;
  for (let i = 0; i < width; i += 1) {
    if (poly & (1 << i)) reflected |= 1 << (width - 1 - i);
  }
  return reflected & maskFor(width);
}

export function buildTable(width, poly, refin) {
  const mask = maskFor(width);
  const workingPoly = refin ? reflectPoly(poly, width) : poly;
  return Array.from({ length: 256 }, (_, index) => {
    let crc = refin ? index : index << (width - 8);
    for (let bit = 0; bit < 8; bit += 1) {
      if (refin) crc = (crc & 1) ? (crc >>> 1) ^ workingPoly : crc >>> 1;
      else crc = (crc & (1 << (width - 1))) ? ((crc << 1) ^ workingPoly) & mask : (crc << 1) & mask;
    }
    return crc & mask;
  });
}

export function parseBytes(value, mode) {
  if (mode === "ascii") return Array.from(new TextEncoder().encode(value));
  const cleaned = value.replace(/0x/gi, "").replace(/[,;_-]/g, " ").trim();
  if (!cleaned) return [];
  if (/\s/.test(cleaned)) {
    return cleaned.split(/\s+/).map((part) => Number.parseInt(part, 16)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 0xff);
  }
  const compact = cleaned.replace(/\s/g, "");
  if (!/^[0-9a-fA-F]+$/.test(compact) || compact.length % 2) return [];
  return compact.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
}

export function makeFrames(bytes, width, poly, init, refin, table) {
  const mask = maskFor(width);
  const workingPoly = refin ? reflectPoly(poly, width) : poly;
  let direct = init & mask;
  let tableCrc = init & mask;
  const frames = [{
    type: "initial", byteIndex: -1, bitIndex: -1, dataByte: 0, dataBit: 0,
    byteCrcBefore: direct, preloaded: direct, directBefore: direct, direct, preBefore: direct, pre: direct, tableBefore: tableCrc, table: tableCrc,
    feedback: 0, remainingMask: 0, tableIndex: 0, tableValue: table[0], polyApplied: false,
  }];

  bytes.forEach((dataByte, byteIndex) => {
    const byteCrcBefore = direct;
    const tableBefore = tableCrc;
    const tableIndex = refin ? (tableCrc ^ dataByte) & 0xff : ((tableCrc >>> (width - 8)) ^ dataByte) & 0xff;
    const tableValue = table[tableIndex];
    const tableNext = refin
      ? ((tableCrc >>> 8) ^ tableValue) & mask
      : (((tableCrc << 8) & mask) ^ tableValue) & mask;
    const preloaded = refin ? direct ^ dataByte : direct ^ (dataByte << (width - 8));
    let pre = preloaded;
    frames.push({
      type: "byteStart", byteIndex, bitIndex: -1, dataByte, dataBit: 0,
      byteCrcBefore, preloaded, directBefore: direct, direct, preBefore: direct, pre, tableBefore, table: tableCrc,
      feedback: 0, remainingMask: refin ? dataByte : (dataByte << (width - 8)) & mask,
      tableIndex, tableValue, polyApplied: false,
    });

    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      const directBefore = direct;
      const dataBit = refin ? (dataByte >>> bitIndex) & 1 : (dataByte >>> (7 - bitIndex)) & 1;
      const crcEdge = refin ? direct & 1 : (direct >>> (width - 1)) & 1;
      const feedback = crcEdge ^ dataBit;
      if (refin) direct = ((direct >>> 1) ^ (feedback ? workingPoly : 0)) & mask;
      else direct = (((direct << 1) & mask) ^ (feedback ? workingPoly : 0)) & mask;

      const preBefore = pre;
      const preEdge = refin ? pre & 1 : (pre >>> (width - 1)) & 1;
      if (refin) pre = ((pre >>> 1) ^ (preEdge ? workingPoly : 0)) & mask;
      else pre = (((pre << 1) & mask) ^ (preEdge ? workingPoly : 0)) & mask;

      const remainingMask = refin
        ? dataByte >>> (bitIndex + 1)
        : (dataByte << (width - 8 + bitIndex + 1)) & mask;
      frames.push({
        type: "bit", byteIndex, bitIndex, dataByte, dataBit, byteCrcBefore, preloaded, directBefore, direct, preBefore, pre,
        tableBefore, table: bitIndex === 7 ? tableNext : tableCrc,
        feedback, remainingMask, tableIndex, tableValue, polyApplied: Boolean(feedback),
      });
    }
    tableCrc = tableNext;
  });

  frames.push({
    type: "final", byteIndex: bytes.length - 1, bitIndex: 7, dataByte: bytes.at(-1) ?? 0, dataBit: 0,
    byteCrcBefore: direct, preloaded: direct, directBefore: direct, direct, preBefore: direct, pre: direct, tableBefore: tableCrc, table: tableCrc,
    feedback: 0, remainingMask: 0, tableIndex: 0, tableValue: 0, polyApplied: false,
  });
  return frames;
}

export function lookupTrace(index, width, poly, refin) {
  const mask = maskFor(width);
  const workingPoly = refin ? reflectPoly(poly, width) : poly;
  let value = refin ? index : index << (width - 8);
  return Array.from({ length: 8 }, (_, bit) => {
    const before = value;
    const edge = refin ? value & 1 : (value >>> (width - 1)) & 1;
    const shifted = refin ? value >>> 1 : (value << 1) & mask;
    value = (shifted ^ (edge ? workingPoly : 0)) & mask;
    return { bit, before, edge, shifted, after: value };
  });
}

export function calculateCrc(bytes, parameters) {
  const { width, poly, init, xorOut, refin } = parameters;
  const table = buildTable(width, poly, refin);
  const frames = makeFrames(bytes, width, poly, init, refin, table);
  return (((frames.at(-1)?.direct ?? init) ^ xorOut) & maskFor(width));
}
