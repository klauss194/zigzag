export const HEADER_WINDOW_BYTES = 64 * 1024;

export const HEADER_MAX_READS = 64;

export const HEADER_MAX_OFFSET = 16 * 1024 * 1024;

const MAX_META_BYTES = 1024 * 1024;

class HeaderWindow {
  #blob;
  #start = 0;
  #bytes = new Uint8Array(0);
  reads = 0;

  constructor(blob) { this.#blob = blob; }

  get size() { return this.#blob.size; }

  async bytes(offset, length) {
    if (offset < 0 || length < 0) return null;
    const end = Math.min(offset + length, this.#blob.size);
    if (offset >= this.#start && end <= this.#start + this.#bytes.length) {
      return this.#bytes.subarray(offset - this.#start, end - this.#start);
    }
    if (offset >= HEADER_MAX_OFFSET || this.reads >= HEADER_MAX_READS) return null;
    const windowEnd = Math.min(this.#blob.size, offset + Math.max(length, HEADER_WINDOW_BYTES));
    this.#bytes = new Uint8Array(await this.#blob.slice(offset, windowEnd).arrayBuffer());
    this.#start = offset;
    this.reads += 1;
    return this.#bytes.subarray(0, Math.min(length, this.#bytes.length));
  }
}

const MAX_JPEG_SEGMENTS = 4096;

const MAX_PNG_CHUNKS = 256;

const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx']);
const IMAGE_BRANDS = new Set([...AVIF_BRANDS, ...HEIC_BRANDS, 'mif1', 'msf1']);

export class ImageHeader {
  static async read(blob) {
    if (!blob || typeof blob.slice !== 'function' || !(blob.size > 0)) return null;
    const source = new HeaderWindow(blob);
    try {
      const start = await source.bytes(0, 32);
      if (!start || start.length < 12) return null;
      if (start[0] === 0xFF && start[1] === 0xD8 && start[2] === 0xFF) return await ImageHeader.#readJPEG(source);
      if (ImageHeader.#startsWith(start, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return await ImageHeader.#readPNG(source);
      if (ImageHeader.#ascii(start, 0, 6) === 'GIF87a' || ImageHeader.#ascii(start, 0, 6) === 'GIF89a') return ImageHeader.#readGIF(start);
      if (ImageHeader.#ascii(start, 0, 4) === 'RIFF' && ImageHeader.#ascii(start, 8, 4) === 'WEBP') return await ImageHeader.#readWebP(source);
      if (ImageHeader.#ascii(start, 4, 4) === 'ftyp') return await ImageHeader.#readISOBMFF(source);
      return null;
    } catch {
      return null;
    }
  }

  static #seen(format, width, height, orientation = 1, animated = false) {
    if (!(width > 0 && height > 0)) return null;
    const turned = orientation >= 5 && orientation <= 8;
    return { format, w: turned ? height : width, h: turned ? width : height, orientation, animated };
  }

  static #ascii(bytes, at, length) {
    return String.fromCharCode(...bytes.subarray(at, at + length));
  }

  static #startsWith(bytes, at, prefix) {
    return prefix.every((byte, i) => bytes[at + i] === byte);
  }

  static #u16be(b, at) {
    return (b[at] << 8) | b[at + 1];
  }

  static #u32be(b, at) {
    return ((b[at] << 24) >>> 0) + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);
  }

  static #u16le(b, at) {
    return b[at] | (b[at + 1] << 8);
  }

  static #u24le(b, at) {
    return b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
  }

  static #isFrameHeader(marker) {
    return marker >= 0xC0 && marker <= 0xCF
      && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
  }

  static async #readJPEG(source) {
    let orientation = 1;
    let at = 2;
    for (let segment = 0; segment < MAX_JPEG_SEGMENTS; segment += 1) {
      const head = await source.bytes(at, 4);
      if (!head || head.length < 2) return null;
      if (head[0] !== 0xFF) {
        const ahead = await source.bytes(at, 4096);
        if (!ahead || !ahead.length) return null;
        const next = ahead.indexOf(0xFF);
        at += next < 0 ? ahead.length : next;
        continue;
      }
      const marker = head[1];
      if (marker === 0xFF) { at += 1; continue; }
      if (marker === 0x01 || marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) { at += 2; continue; }
      if (marker === 0xD9 || marker === 0xDA) return null;
      if (head.length < 4) return null;
      const length = ImageHeader.#u16be(head, 2);
      if (length < 2) return null;
      if (ImageHeader.#isFrameHeader(marker)) {
        const frame = await source.bytes(at + 4, 5);
        if (!frame || frame.length < 5) return null;
        return ImageHeader.#seen('jpeg', ImageHeader.#u16be(frame, 3), ImageHeader.#u16be(frame, 1), orientation);
      }
      if (marker === 0xE1 && orientation === 1) {
        const payload = await source.bytes(at + 4, length - 2);
        if (payload && ImageHeader.#ascii(payload, 0, 6) === 'Exif\0\0') orientation = ImageHeader.exifOrientation(payload.subarray(6));
      }
      at += 2 + length;
    }
    return null;
  }

  static exifOrientation(tiff) {
    if (tiff.length < 8) return 1;
    const order = ImageHeader.#ascii(tiff, 0, 2);
    if (order !== 'II' && order !== 'MM') return 1;
    const little = order === 'II';
    const u16 = (at) => (little ? ImageHeader.#u16le(tiff, at) : ImageHeader.#u16be(tiff, at));
    const u32 = (at) => (little ? (ImageHeader.#u16le(tiff, at) + ImageHeader.#u16le(tiff, at + 2) * 0x10000) : ImageHeader.#u32be(tiff, at));
    if (u16(2) !== 42) return 1;
    const ifd = u32(4);
    if (ifd + 2 > tiff.length) return 1;
    const count = u16(ifd);
    for (let i = 0; i < count; i += 1) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > tiff.length) return 1;
      if (u16(entry) !== 0x0112) continue;
      if (u16(entry + 2) !== 3 || u32(entry + 4) < 1) return 1;
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
    return 1;
  }

  static async #readPNG(source) {
    const ihdr = await source.bytes(8, 25);
    if (!ihdr || ihdr.length < 25 || ImageHeader.#ascii(ihdr, 4, 4) !== 'IHDR' || ImageHeader.#u32be(ihdr, 0) !== 13) return null;
    const width = ImageHeader.#u32be(ihdr, 8), height = ImageHeader.#u32be(ihdr, 12);
    let at = 8 + 25;
    for (let chunk = 0; chunk < MAX_PNG_CHUNKS; chunk += 1) {
      const head = await source.bytes(at, 8);
      if (!head || head.length < 8) return ImageHeader.#seen('png', width, height, 1, false);
      const type = ImageHeader.#ascii(head, 4, 4);
      if (type === 'IDAT' || type === 'IEND') return ImageHeader.#seen('png', width, height, 1, false);
      if (type === 'acTL') return ImageHeader.#seen('png', width, height, 1, true);
      if (type === 'eXIf') return null;
      at += 12 + ImageHeader.#u32be(head, 0);
    }
    return ImageHeader.#seen('png', width, height, 1, false);
  }

  static #readGIF(start) {
    return ImageHeader.#seen('gif', ImageHeader.#u16le(start, 6), ImageHeader.#u16le(start, 8), 1, null);
  }

  static async #readWebP(source) {
    const head = await source.bytes(12, 18);
    if (!head || head.length < 18) return null;
    const chunk = ImageHeader.#ascii(head, 0, 4);
    if (chunk === 'VP8 ') {
      if (head[11] !== 0x9D || head[12] !== 0x01 || head[13] !== 0x2A) return null;
      return ImageHeader.#seen('webp', ImageHeader.#u16le(head, 14) & 0x3FFF, ImageHeader.#u16le(head, 16) & 0x3FFF);
    }
    if (chunk === 'VP8L') {
      if (head[8] !== 0x2F) return null;
      const bits = head[9] | (head[10] << 8) | (head[11] << 16) | (head[12] << 24);
      return ImageHeader.#seen('webp', (bits & 0x3FFF) + 1, ((bits >>> 14) & 0x3FFF) + 1);
    }
    if (chunk === 'VP8X') {
      const animated = (head[8] & 0x02) !== 0;
      return ImageHeader.#seen('webp', ImageHeader.#u24le(head, 12) + 1, ImageHeader.#u24le(head, 15) + 1, 1, animated);
    }
    return null;
  }

  static #boxesIn(bytes, from, to) {
    const boxes = [];
    for (let at = from; at + 8 <= to;) {
      let size = ImageHeader.#u32be(bytes, at);
      const type = ImageHeader.#ascii(bytes, at + 4, 4);
      let body = at + 8;
      if (size === 1) {
        if (at + 16 > to) break;
        size = ImageHeader.#u32be(bytes, at + 8) * 2 ** 32 + ImageHeader.#u32be(bytes, at + 12);
        body = at + 16;
      } else if (size === 0) {
        size = to - at;
      }
      if (size < body - at || at + size > to) break;
      boxes.push({ type, start: at, end: at + size, body });
      at += size;
    }
    return boxes;
  }

  static async #readISOBMFF(source) {
    const ftypHead = await source.bytes(0, 8);
    const ftypSize = ImageHeader.#u32be(ftypHead, 0);
    if (ftypSize < 16 || ftypSize > 4096) return null;
    const ftyp = await source.bytes(0, ftypSize);
    if (!ftyp || ftyp.length < ftypSize) return null;
    const brands = [ImageHeader.#ascii(ftyp, 8, 4)];
    for (let at = 16; at + 4 <= ftypSize; at += 4) brands.push(ImageHeader.#ascii(ftyp, at, 4));
    if (!brands.some((brand) => IMAGE_BRANDS.has(brand))) return null;
    const format = brands.some((brand) => AVIF_BRANDS.has(brand)) ? 'avif' : 'heic';

    let at = ftypSize;
    for (let box = 0; box < 64; box += 1) {
      const head = await source.bytes(at, 16);
      if (!head || head.length < 8) return null;
      let size = ImageHeader.#u32be(head, 0);
      if (size === 1) size = ImageHeader.#u32be(head, 8) * 2 ** 32 + ImageHeader.#u32be(head, 12);
      if (ImageHeader.#ascii(head, 4, 4) === 'meta') {
        if (size < 12 || size > MAX_META_BYTES) return null;
        const meta = await source.bytes(at, size);
        if (!meta || meta.length < size) return null;
        return ImageHeader.#primaryItemSize(meta, format);
      }
      if (size < 8) return null;
      at += size;
    }
    return null;
  }

  static #primaryItemSize(meta, format) {
    const children = ImageHeader.#boxesIn(meta, 12, meta.length);
    const pitm = children.find((box) => box.type === 'pitm');
    const iprp = children.find((box) => box.type === 'iprp');
    if (!pitm || !iprp) return null;
    const primary = meta[pitm.body] === 0 ? ImageHeader.#u16be(meta, pitm.body + 4) : ImageHeader.#u32be(meta, pitm.body + 4);

    const inProperties = ImageHeader.#boxesIn(meta, iprp.body, iprp.end);
    const ipco = inProperties.find((box) => box.type === 'ipco');
    if (!ipco) return null;
    const properties = ImageHeader.#boxesIn(meta, ipco.body, ipco.end);

    const associated = [];
    for (const ipma of inProperties.filter((box) => box.type === 'ipma')) {
      const version = meta[ipma.body];
      const wideIndex = (meta[ipma.body + 3] & 1) === 1;
      let at = ipma.body + 4;
      const entries = ImageHeader.#u32be(meta, at);
      at += 4;
      for (let entry = 0; entry < entries && at < ipma.end; entry += 1) {
        const item = version < 1 ? ImageHeader.#u16be(meta, at) : ImageHeader.#u32be(meta, at);
        at += version < 1 ? 2 : 4;
        const count = meta[at];
        at += 1;
        for (let i = 0; i < count; i += 1) {
          const index = wideIndex ? ImageHeader.#u16be(meta, at) & 0x7FFF : meta[at] & 0x7F;
          at += wideIndex ? 2 : 1;
          if (item === primary && index > 0) associated.push(properties[index - 1]);
        }
      }
    }
    const ispe = associated.find((box) => box?.type === 'ispe');
    if (!ispe) return null;
    let width = ImageHeader.#u32be(meta, ispe.body + 4), height = ImageHeader.#u32be(meta, ispe.body + 8);
    const clap = associated.find((box) => box?.type === 'clap');
    if (clap) {
      const [widthN, widthD, heightN, heightD] = [0, 4, 8, 12].map((at) => ImageHeader.#u32be(meta, clap.body + at));
      if (!(widthD > 0 && heightD > 0)) return null;
      width = Math.min(width, Math.floor(widthN / widthD));
      height = Math.min(height, Math.floor(heightN / heightD));
    }
    const irot = associated.find((box) => box?.type === 'irot');
    const quarterTurns = irot ? meta[irot.body] & 0x03 : 0;
    const sideways = quarterTurns % 2 === 1;
    return ImageHeader.#seen(format, sideways ? height : width, sideways ? width : height, 1, null);
  }
}
