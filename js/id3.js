/**
 * Lightweight, zero-dependency client-side ID3v2 parser.
 * Extracts embedded Album Cover Art (APIC frame), Title (TIT2), and Artist (TPE1)
 * directly from MP3/FLAC/AAC files in the browser.
 */
export async function extractMetadata(file) {
  const result = {
    title: file.name.replace(/\.[^/.]+$/, ""),
    artist: "Lokale Datei",
    cover: null
  };

  try {
    // Read the first 256KB where ID3v2 headers and artwork typically live
    const sliceSize = Math.min(file.size, 512 * 1024);
    const buffer = await file.slice(0, sliceSize).arrayBuffer();
    const view = new DataView(buffer);

    // Verify 'ID3' header
    if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
      return result; // No ID3v2 header
    }

    const version = view.getUint8(3); // 3 for ID3v2.3, 4 for ID3v2.4
    if (version < 2 || version > 4) {
      return result;
    }

    // Synchsafe integer size calculation
    const tagSize = ((view.getUint8(6) & 0x7f) << 21) |
                    ((view.getUint8(7) & 0x7f) << 14) |
                    ((view.getUint8(8) & 0x7f) << 7) |
                    (view.getUint8(9) & 0x7f);

    const maxOffset = Math.min(buffer.byteLength, tagSize + 10);
    let offset = 10;

    const readString = (start, length, encoding) => {
      const bytes = new Uint8Array(buffer, start, length);
      if (encoding === 1 || encoding === 2) {
        // UTF-16
        const dec = new TextDecoder('utf-16');
        return dec.decode(bytes).replace(/\0/g, '').trim();
      } else if (encoding === 3) {
        // UTF-8
        const dec = new TextDecoder('utf-8');
        return dec.decode(bytes).replace(/\0/g, '').trim();
      } else {
        // ISO-8859-1
        let str = '';
        for (let i = 0; i < bytes.length; i++) {
          if (bytes[i] === 0) break;
          str += String.fromCharCode(bytes[i]);
        }
        return str.trim();
      }
    };

    while (offset + 10 < maxOffset) {
      let frameId = '';
      for (let i = 0; i < 4; i++) {
        const c = view.getUint8(offset + i);
        if (c === 0) break;
        frameId += String.fromCharCode(c);
      }

      if (frameId.length < 4) break;

      let frameSize = 0;
      if (version === 4) {
        // Synchsafe in v2.4
        frameSize = ((view.getUint8(offset + 4) & 0x7f) << 21) |
                    ((view.getUint8(offset + 5) & 0x7f) << 14) |
                    ((view.getUint8(offset + 6) & 0x7f) << 7) |
                    (view.getUint8(offset + 7) & 0x7f);
      } else {
        // Standard in v2.3
        frameSize = view.getUint32(offset + 4);
      }

      if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) {
        break;
      }

      const frameDataOffset = offset + 10;

      // Extract Title (TIT2)
      if (frameId === 'TIT2' && frameSize > 1) {
        const enc = view.getUint8(frameDataOffset);
        const text = readString(frameDataOffset + 1, frameSize - 1, enc);
        if (text) result.title = text;
      }

      // Extract Artist (TPE1)
      if (frameId === 'TPE1' && frameSize > 1) {
        const enc = view.getUint8(frameDataOffset);
        const text = readString(frameDataOffset + 1, frameSize - 1, enc);
        if (text) result.artist = text;
      }

      // Extract Embedded Cover Art (APIC)
      if (frameId === 'APIC' && frameSize > 10 && !result.cover) {
        try {
          const enc = view.getUint8(frameDataOffset);
          let p = frameDataOffset + 1;

          // Read MIME type (null-terminated ISO-8859-1)
          let mime = '';
          while (p < frameDataOffset + frameSize && view.getUint8(p) !== 0) {
            mime += String.fromCharCode(view.getUint8(p));
            p++;
          }
          p++; // Skip null byte

          // Picture type (1 byte, 0x03 is front cover)
          p++;

          // Description (null-terminated according to encoding)
          if (enc === 1 || enc === 2) {
            while (p + 1 < frameDataOffset + frameSize && !(view.getUint8(p) === 0 && view.getUint8(p + 1) === 0)) {
              p += 2;
            }
            p += 2;
          } else {
            while (p < frameDataOffset + frameSize && view.getUint8(p) !== 0) {
              p++;
            }
            p++;
          }

          const imgDataStart = p;
          const imgDataLength = (frameDataOffset + frameSize) - imgDataStart;
          if (imgDataLength > 64) {
            const imgBytes = new Uint8Array(buffer, imgDataStart, imgDataLength);
            const blob = new Blob([imgBytes], { type: mime || 'image/jpeg' });
            result.cover = URL.createObjectURL(blob);
          }
        } catch (e) {
          console.warn("APIC frame parse error:", e);
        }
      }

      offset += 10 + frameSize;
    }
  } catch (err) {
    console.warn("Could not parse ID3 metadata:", err);
  }

  return result;
}
