// Read-only inventory of the installed Windows runtime's resource containers.
// Formats: Microsoft PE/COFF resources, Electron ASAR, Chromium DataPack v5.
export function peResources(bytes) {
  const pe = bytes.readUInt32LE(0x3c);
  if (bytes.toString("ascii", pe, pe + 4) !== "PE\0\0")
    throw new Error("Not a PE file");
  const optional = pe + 24;
  const directory =
    optional + (bytes.readUInt16LE(optional) === 0x20b ? 112 : 96);
  const resourceRva = bytes.readUInt32LE(directory + 16);
  if (!resourceRva) return [];
  const sectionTable = optional + bytes.readUInt16LE(pe + 20);
  const sections = Array.from(
    { length: bytes.readUInt16LE(pe + 6) },
    (_, i) => {
      const at = sectionTable + i * 40;
      return {
        rva: bytes.readUInt32LE(at + 12),
        size: Math.max(bytes.readUInt32LE(at + 8), bytes.readUInt32LE(at + 16)),
        offset: bytes.readUInt32LE(at + 20),
      };
    },
  );
  function offset(rva) {
    const section = sections.find((s) => rva >= s.rva && rva < s.rva + s.size);
    if (!section) throw new Error("Unmapped resource RVA");
    return section.offset + rva - section.rva;
  }
  const base = offset(resourceRva),
    result = [];
  function walk(relative, keys = []) {
    if (keys.length > 3) throw new Error("Unexpected resource depth");
    const dir = base + relative;
    const count = bytes.readUInt16LE(dir + 12) + bytes.readUInt16LE(dir + 14);
    for (let i = 0; i < count; i++) {
      const at = dir + 16 + i * 8;
      const name = bytes.readUInt32LE(at),
        target = bytes.readUInt32LE(at + 4);
      const nameAt = base + (name & 0x7fffffff);
      const key =
        name & 0x80000000
          ? bytes.toString(
              "utf16le",
              nameAt + 2,
              nameAt + 2 + bytes.readUInt16LE(nameAt) * 2,
            )
          : name;
      const path = [...keys, key];
      if (target & 0x80000000) walk(target & 0x7fffffff, path);
      else {
        const entry = base + target;
        const start = offset(bytes.readUInt32LE(entry));
        const size = bytes.readUInt32LE(entry + 4);
        result.push({
          type: path[0],
          name: path[1],
          language: path[2],
          data: bytes.subarray(start, start + size),
        });
      }
    }
  }
  walk(0);
  return result;
}

export function asarEntries(bytes) {
  const header = JSON.parse(
    bytes.toString("utf8", 16, 16 + bytes.readUInt32LE(12)),
  );
  const base = 8 + bytes.readUInt32LE(4),
    result = [];
  function walk(tree, prefix = "") {
    for (const [name, entry] of Object.entries(tree.files ?? {})) {
      const path = prefix + name;
      if (entry.files) walk(entry, path + "/");
      else if (entry.offset !== undefined) {
        const start = base + Number(entry.offset);
        result.push({
          name: path,
          data: bytes.subarray(start, start + entry.size),
        });
      }
    }
  }
  walk(header);
  return result;
}

export function pakEntries(bytes) {
  if (bytes.readUInt32LE(0) !== 5) throw new Error("Expected DataPack v5");
  const count = bytes.readUInt16LE(8);
  return Array.from({ length: count }, (_, i) => {
    const at = 12 + i * 6;
    return {
      name: bytes.readUInt16LE(at),
      data: bytes.subarray(
        bytes.readUInt32LE(at + 2),
        bytes.readUInt32LE(at + 8),
      ),
    };
  });
}

export function icoFrames(bytes) {
  if (bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1)
    throw new Error("Expected ICO file");
  return Array.from({ length: bytes.readUInt16LE(4) }, (_, i) => {
    const at = 6 + i * 16,
      start = bytes.readUInt32LE(at + 12);
    return bytes.subarray(start, start + bytes.readUInt32LE(at + 8));
  });
}
