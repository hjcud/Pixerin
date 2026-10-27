import { PNG } from "pngjs";
import { validateDocument, documentRGBA } from "../src/core.mjs";
import { frameAt, frameCount } from "../src/animation.mjs";

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let value = i; for (let j = 0; j < 8; j++) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes) {
  let value = 0xFFFFFFFF;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
export function animatedPNG(source) {
  const doc = validateDocument(source), count = frameCount(doc), output = [];
  let sequence = 0;
  for (let i = 0; i < count; i++) {
    const png = PNG.sync.write({ width: doc.width, height: doc.height, data: Buffer.from(documentRGBA(frameAt(doc, i))) });
    if (!i) {
      output.push(png.subarray(0, 33));
      const control = Buffer.alloc(8); control.writeUInt32BE(count); control.writeUInt32BE(doc.animation?.loop === false ? 1 : 0, 4);
      output.push(chunk("acTL", control));
    }
    const frame = Buffer.alloc(26);
    frame.writeUInt32BE(sequence++, 0); frame.writeUInt32BE(doc.width, 4); frame.writeUInt32BE(doc.height, 8);
    frame.writeUInt16BE(doc.animation?.frames[i].duration || 100, 20); frame.writeUInt16BE(1000, 22);
    // Full-frame source replacement preserves transparent holes between frames.
    frame[24] = 0; frame[25] = 0; output.push(chunk("fcTL", frame));
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset), type = png.toString("ascii", offset + 4, offset + 8);
      if (type === "IDAT") {
        const data = png.subarray(offset + 8, offset + 8 + length);
        if (!i) output.push(chunk("IDAT", data));
        else {
          const seq = Buffer.alloc(4); seq.writeUInt32BE(sequence++);
          output.push(chunk("fdAT", Buffer.concat([seq, data])));
        }
      }
      offset += 12 + length;
    }
  }
  output.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(output);
}
// A single ZIP is atomically saved. No sidecar can overwrite an unrelated file.
export function zipFiles(files) {
  const local = [], central = []; let offset = 0;
  for (const [name, value] of files) {
    const filename = Buffer.from(name), data = Buffer.from(value), crc = crc32(data);
    if (!name.split("/").every(part => /^[\w.-]+$/.test(part) && ![".", ".."].includes(part)) || data.length > 512 * 1024 * 1024) throw Error("Invalid sprite export entry");
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034B50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014B50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x21, 14);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, filename); offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export function spriteBundle(source) {
  const doc = validateDocument(source), count = frameCount(doc), files = [], frames = [];
  const columns = Math.max(1, Math.min(8, Math.floor(4096 / doc.width), count));
  const rows = Math.max(1, Math.floor(4096 / doc.height)), perPage = columns * rows;
  for (let start = 0, page = 1; start < count; start += perPage, page++) {
    const amount = Math.min(perPage, count - start), width = Math.min(columns, amount) * doc.width, height = Math.ceil(amount / columns) * doc.height;
    const data = Buffer.alloc(width * height * 4), image = `sheet-${page}.png`;
    for (let n = 0; n < amount; n++) {
      const index = start + n, x = n % columns * doc.width, y = Math.floor(n / columns) * doc.height;
      const rgba = documentRGBA(frameAt(doc, index));
      for (let row = 0; row < doc.height; row++)
        data.set(rgba.subarray(row * doc.width * 4, (row + 1) * doc.width * 4), ((y + row) * width + x) * 4);
      frames.push({ filename: `frame-${index + 1}`, image, frame: { x, y, w: doc.width, h: doc.height },
        duration: doc.animation?.frames[index].duration || 100, rotated: false, trimmed: false,
        sourceSize: { w: doc.width, h: doc.height }, pivot: { x: 0.5, y: 1 } });
    }
    files.push([image, PNG.sync.write({ width, height, data })]);
  }
  files.push(["spritesheet.json", Buffer.from(JSON.stringify({ frames, meta: { app: "Pixel Mat", version: 1,
    size: { w: doc.width, h: doc.height }, loop: doc.animation?.loop !== false, scale: "1", filter: "nearest", origin: "top-left" } }, null, 2))]);
  files.push(["preview.apng", animatedPNG(doc)]);
  return { bytes: zipFiles(files), frames: count, pages: files.length - 2 };
}
