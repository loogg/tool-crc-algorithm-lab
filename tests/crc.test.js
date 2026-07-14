import assert from 'node:assert/strict'
import test from 'node:test'

import { PRESETS, buildTable, calculateCrc, makeFrames, parseBytes } from '../src/crc.js'

function maskFor(width) {
  return width === 16 ? 0xffff : 0xff
}

function reverseBits(value, width) {
  let reflected = 0
  for (let bit = 0; bit < width; bit += 1) {
    if (value & (1 << bit)) reflected |= 1 << (width - 1 - bit)
  }
  return reflected & maskFor(width)
}

function referenceCrc(bytes, parameters) {
  const { width, poly, init, xorOut, refin } = parameters
  const mask = maskFor(width)
  const workingPoly = refin ? reverseBits(poly, width) : poly
  let crc = init & mask

  for (const byte of bytes) {
    for (let bit = 0; bit < 8; bit += 1) {
      const dataBit = refin ? (byte >>> bit) & 1 : (byte >>> (7 - bit)) & 1
      const edge = refin ? crc & 1 : (crc >>> (width - 1)) & 1
      const feedback = edge ^ dataBit
      crc = refin ? crc >>> 1 : (crc << 1) & mask
      if (feedback) crc ^= workingPoly
      crc &= mask
    }
  }

  return (crc ^ xorOut) & mask
}

function referenceTableEntry(index, parameters) {
  const { width, poly, refin } = parameters
  const mask = maskFor(width)
  const workingPoly = refin ? reverseBits(poly, width) : poly
  let crc = refin ? index : index << (width - 8)

  for (let bit = 0; bit < 8; bit += 1) {
    const edge = refin ? crc & 1 : (crc >>> (width - 1)) & 1
    crc = refin ? crc >>> 1 : (crc << 1) & mask
    if (edge) crc ^= workingPoly
    crc &= mask
  }

  return crc
}

test('standard check vectors match all built-in presets', () => {
  const bytes = parseBytes('123456789', 'ascii')
  for (const preset of PRESETS) {
    assert.equal(calculateCrc(bytes, preset), preset.check, preset.name)
    assert.equal(calculateCrc(bytes, preset), referenceCrc(bytes, preset), preset.name)
  }
})

test('direct, pre-xor, and table paths converge at every byte boundary', () => {
  const bytes = parseBytes('31 32 33 34 A5 00 FF', 'hex')
  for (const preset of PRESETS) {
    const table = buildTable(preset.width, preset.poly, preset.refin)
    const frames = makeFrames(bytes, preset.width, preset.poly, preset.init, preset.refin, table)
    const boundaries = frames.filter((frame) => frame.type === 'bit' && frame.bitIndex === 7)
    assert.equal(boundaries.length, bytes.length)
    for (const frame of boundaries) {
      assert.equal(frame.direct, frame.pre, preset.name)
      assert.equal(frame.direct, frame.table, preset.name)
    }
  }
})

test('hex and UTF-8 input parsing is deterministic', () => {
  assert.deepEqual(parseBytes('313233', 'hex'), [0x31, 0x32, 0x33])
  assert.deepEqual(parseBytes('0x31, 32;33-34_35', 'hex'), [0x31, 0x32, 0x33, 0x34, 0x35])
  assert.deepEqual(parseBytes('31 GG 32', 'hex'), [0x31, 0x32])
  assert.deepEqual(parseBytes('123', 'hex'), [])
  assert.deepEqual(parseBytes('31GG', 'hex'), [])
  assert.deepEqual(parseBytes('A中', 'ascii'), Array.from(new TextEncoder().encode('A中')))
})

test('all 256 table entries match an independent bitwise reference', () => {
  for (const preset of PRESETS) {
    const table = buildTable(preset.width, preset.poly, preset.refin)
    assert.equal(table.length, 256)
    for (let index = 0; index < 256; index += 1) {
      assert.equal(table[index], referenceTableEntry(index, preset), preset.name + ' index ' + index)
    }
  }
})
