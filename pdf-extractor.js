// PDF text extraction helpers for readable, text-layer PDFs.

/**
 * Convert a byte array to a binary string while preserving byte positions.
 * @param {Uint8Array} bytes Raw bytes.
 * @returns {string} Binary string.
 */
function bytesToBinaryString(bytes) {
  const chunkSize = 0x8000;
  let output = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    output += String.fromCharCode(...chunk);
  }

  return output;
}

/**
 * Convert a binary string to raw bytes.
 * @param {string} value Binary string.
 * @returns {Uint8Array} Raw bytes.
 */
function binaryStringToBytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index++) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

/**
 * Inflate PDF stream bytes when the browser exposes DecompressionStream.
 * @param {Uint8Array} bytes Compressed stream bytes.
 * @returns {Promise<Uint8Array>} Inflated bytes.
 */
async function inflatePdfStream(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('PDF stream decompression is not supported by this browser');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Find stream objects in a PDF binary string.
 * @param {string} binary PDF binary string.
 * @returns {{dictionary: string, data: string}[]} PDF streams.
 */
function findPdfStreams(binary) {
  const streams = [];
  let searchIndex = 0;

  while (searchIndex < binary.length) {
    const streamKeywordIndex = binary.indexOf('stream', searchIndex);
    if (streamKeywordIndex === -1) break;

    const dictionaryEnd = binary.lastIndexOf('>>', streamKeywordIndex);
    const dictionaryStart = binary.lastIndexOf('<<', dictionaryEnd);
    const endStreamIndex = binary.indexOf('endstream', streamKeywordIndex);

    if (dictionaryStart === -1 || dictionaryEnd === -1 || endStreamIndex === -1) {
      searchIndex = streamKeywordIndex + 6;
      continue;
    }

    let dataStart = streamKeywordIndex + 6;
    if (binary.slice(dataStart, dataStart + 2) === '\r\n') {
      dataStart += 2;
    } else if (binary[dataStart] === '\n' || binary[dataStart] === '\r') {
      dataStart += 1;
    }

    let dataEnd = endStreamIndex;
    if (binary.slice(dataEnd - 2, dataEnd) === '\r\n') {
      dataEnd -= 2;
    } else if (binary[dataEnd - 1] === '\n' || binary[dataEnd - 1] === '\r') {
      dataEnd -= 1;
    }

    streams.push({
      dictionary: binary.slice(dictionaryStart, dictionaryEnd + 2),
      data: binary.slice(dataStart, dataEnd)
    });
    searchIndex = endStreamIndex + 9;
  }

  return streams;
}

/**
 * Decode one PDF stream according to the filters this extension supports.
 * @param {{dictionary: string, data: string}} stream PDF stream metadata and data.
 * @returns {Promise<string|null>} Decoded stream text, or null when unsupported.
 */
async function decodePdfStream(stream) {
  const rawBytes = binaryStringToBytes(stream.data);
  const hasFlateFilter = /\/Filter\s*(?:\[[^\]]*)?\/FlateDecode\b/.test(stream.dictionary);

  if (!hasFlateFilter) {
    return bytesToBinaryString(rawBytes);
  }

  try {
    const inflatedBytes = await inflatePdfStream(rawBytes);
    return bytesToBinaryString(inflatedBytes);
  } catch (error) {
    console.warn('[Page Copilot] Failed to inflate PDF stream:', error);
    return null;
  }
}

/**
 * Normalize PDF CMap hex keys.
 * @param {string} value Hex value.
 * @returns {string} Uppercase hex without whitespace.
 */
function normalizePdfHex(value) {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Convert a Unicode code point to a JavaScript string.
 * @param {number} codePoint Unicode code point.
 * @returns {string} Decoded character.
 */
function codePointToString(codePoint) {
  try {
    return String.fromCodePoint(codePoint);
  } catch (error) {
    return '';
  }
}

/**
 * Decode a destination CMap hex value.
 * @param {string} hex Destination hex.
 * @returns {string} Unicode string.
 */
function decodeCMapDestination(hex) {
  const normalizedHex = normalizePdfHex(hex);
  if (!normalizedHex) return '';

  const bytes = [];
  for (let index = 0; index < normalizedHex.length; index += 2) {
    bytes.push(parseInt(normalizedHex.slice(index, index + 2), 16));
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    bytes.splice(0, 2);
  }

  let output = '';
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    output += codePointToString((bytes[index] << 8) + bytes[index + 1]);
  }
  return output;
}

/**
 * Parse ToUnicode CMap data into a character-code map.
 * @param {string[]} decodedStreams Decoded PDF streams.
 * @returns {Map<string, string>} Character-code to Unicode map.
 */
function buildPdfUnicodeMap(decodedStreams) {
  const unicodeMap = new Map();

  decodedStreams
    .filter((streamText) => streamText.includes('begincmap'))
    .forEach((streamText) => {
      const bfcharMatches = streamText.matchAll(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g);
      for (const match of bfcharMatches) {
        unicodeMap.set(normalizePdfHex(match[1]), decodeCMapDestination(match[2]));
      }

      const rangeMatches = streamText.matchAll(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*(?:<([0-9A-Fa-f\s]+)>|\[([^\]]+)\])/g);
      for (const match of rangeMatches) {
        const start = parseInt(normalizePdfHex(match[1]), 16);
        const end = parseInt(normalizePdfHex(match[2]), 16);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 1000) continue;

        const keyWidth = normalizePdfHex(match[1]).length;
        if (match[3]) {
          const destinationStart = parseInt(normalizePdfHex(match[3]), 16);
          if (!Number.isFinite(destinationStart)) continue;

          for (let code = start; code <= end; code++) {
            unicodeMap.set(code.toString(16).toUpperCase().padStart(keyWidth, '0'), codePointToString(destinationStart + code - start));
          }
        } else if (match[4]) {
          const destinations = [...match[4].matchAll(/<([0-9A-Fa-f\s]+)>/g)];
          destinations.forEach((destination, offset) => {
            unicodeMap.set((start + offset).toString(16).toUpperCase().padStart(keyWidth, '0'), decodeCMapDestination(destination[1]));
          });
        }
      }
    });

  return unicodeMap;
}

/**
 * Decode raw PDF text bytes using UTF-16BE, ToUnicode maps, or Latin text.
 * @param {Uint8Array} bytes Encoded PDF text bytes.
 * @param {Map<string, string>} unicodeMap Character-code map.
 * @returns {string} Decoded text.
 */
function decodePdfTextBytes(bytes, unicodeMap) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let output = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      output += codePointToString((bytes[index] << 8) + bytes[index + 1]);
    }
    return output;
  }

  if (unicodeMap.size > 0) {
    const hex = Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join('');
    const keyLengths = [...new Set([...unicodeMap.keys()].map((key) => key.length))].sort((a, b) => b - a);
    let output = '';
    let index = 0;

    while (index < hex.length) {
      const keyLength = keyLengths.find((length) => unicodeMap.has(hex.slice(index, index + length)));
      if (keyLength) {
        output += unicodeMap.get(hex.slice(index, index + keyLength));
        index += keyLength;
      } else {
        output += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
        index += 2;
      }
    }

    return output;
  }

  return new TextDecoder('windows-1252').decode(bytes);
}

/**
 * Decode a PDF literal string body into raw bytes.
 * @param {string} value Literal string body without wrapping parentheses.
 * @returns {Uint8Array} Decoded bytes.
 */
function decodePdfLiteralBytes(value) {
  const bytes = [];

  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char !== '\\') {
      bytes.push(char.charCodeAt(0) & 0xff);
      continue;
    }

    const next = value[++index];
    if (next === undefined) break;
    if (next === 'n') bytes.push(10);
    else if (next === 'r') bytes.push(13);
    else if (next === 't') bytes.push(9);
    else if (next === 'b') bytes.push(8);
    else if (next === 'f') bytes.push(12);
    else if (next === '\n') continue;
    else if (next === '\r') {
      if (value[index + 1] === '\n') index++;
    } else if (/[0-7]/.test(next)) {
      let octal = next;
      for (let count = 0; count < 2 && /[0-7]/.test(value[index + 1] || ''); count++) {
        octal += value[++index];
      }
      bytes.push(parseInt(octal, 8) & 0xff);
    } else {
      bytes.push(next.charCodeAt(0) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Decode a PDF hex string into raw bytes.
 * @param {string} value Hex string body without wrapping brackets.
 * @returns {Uint8Array} Decoded bytes.
 */
function decodePdfHexBytes(value) {
  let hex = normalizePdfHex(value);
  if (hex.length % 2 === 1) hex += '0';

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

/**
 * Extract text from a decoded PDF content stream.
 * @param {string} streamText Decoded content stream.
 * @param {Map<string, string>} unicodeMap Character-code map.
 * @returns {string} Extracted text.
 */
function extractTextFromPdfContentStream(streamText, unicodeMap) {
  if (streamText.includes('begincmap')) return '';

  const operands = [];
  let output = '';
  let index = 0;

  const pushText = (text) => {
    const normalizedText = text.replace(/\s+/g, ' ');
    if (normalizedText.trim()) output += normalizedText;
  };

  while (index < streamText.length) {
    const char = streamText[index];

    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (char === '(') {
      let depth = 1;
      let body = '';
      index++;
      while (index < streamText.length && depth > 0) {
        const current = streamText[index];
        if (current === '\\') {
          body += current + (streamText[index + 1] || '');
          index += 2;
        } else if (current === '(') {
          depth++;
          body += current;
          index++;
        } else if (current === ')') {
          depth--;
          if (depth > 0) body += current;
          index++;
        } else {
          body += current;
          index++;
        }
      }
      operands.push({ type: 'text', value: decodePdfTextBytes(decodePdfLiteralBytes(body), unicodeMap) });
      continue;
    }

    if (char === '<' && streamText[index + 1] !== '<') {
      const end = streamText.indexOf('>', index + 1);
      if (end === -1) break;
      operands.push({ type: 'text', value: decodePdfTextBytes(decodePdfHexBytes(streamText.slice(index + 1, end)), unicodeMap) });
      index = end + 1;
      continue;
    }

    if (char === '[') {
      operands.push({ type: 'arrayStart' });
      index++;
      continue;
    }

    if (char === ']') {
      const arrayItems = [];
      while (operands.length > 0) {
        const item = operands.pop();
        if (item.type === 'arrayStart') break;
        arrayItems.unshift(item);
      }
      operands.push({ type: 'array', items: arrayItems });
      index++;
      continue;
    }

    const tokenMatch = streamText.slice(index).match(/^\/?[^\s<>\[\]()]+/);
    if (!tokenMatch) {
      index++;
      continue;
    }

    const token = tokenMatch[0];
    index += token.length;

    if (['Tj', "'", '"'].includes(token)) {
      const operand = operands.pop();
      if (operand?.type === 'text') pushText(operand.value);
      output += '\n';
      operands.length = 0;
    } else if (token === 'TJ') {
      const operand = operands.pop();
      if (operand?.type === 'array') {
        operand.items
          .filter((item) => item.type === 'text')
          .forEach((item) => pushText(item.value));
        output += '\n';
      }
      operands.length = 0;
    } else if (['Td', 'TD', 'T*', 'ET'].includes(token)) {
      output += '\n';
      operands.length = 0;
    } else if (/^[A-Za-z*]+$/.test(token)) {
      operands.length = 0;
    } else {
      operands.push({ type: 'token', value: token });
    }
  }

  return output;
}

/**
 * Extract readable text from a PDF byte array.
 * @param {Uint8Array} bytes PDF bytes.
 * @returns {Promise<string>} Extracted text.
 */
async function extractPdfText(bytes) {
  const binary = bytesToBinaryString(bytes);
  const streams = findPdfStreams(binary);
  const decodedStreams = (await Promise.all(streams.map(decodePdfStream))).filter(Boolean);
  const unicodeMap = buildPdfUnicodeMap(decodedStreams);

  return decodedStreams
    .map((streamText) => extractTextFromPdfContentStream(streamText, unicodeMap))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Fetch a PDF URL and return extracted page content for the side panel.
 * @param {string} url PDF URL.
 * @returns {Promise<object>} Page content payload.
 */
async function extractPdfContent(url) {
  const pdfUrl = new URL(url);
  if (!['http:', 'https:'].includes(pdfUrl.protocol)) {
    throw new Error('Unsupported PDF URL protocol');
  }

  const response = await fetch(pdfUrl.toString(), {
    method: 'GET',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`PDF request failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = await extractPdfText(bytes);

  if (!text) {
    throw new Error(contentType.includes('pdf')
      ? 'No readable PDF text was found. Scanned PDFs are not supported yet.'
      : 'The current page did not return a readable PDF.');
  }

  const fileName = decodeURIComponent(pdfUrl.pathname.split('/').pop() || 'PDF document');
  return {
    title: fileName,
    url: pdfUrl.toString(),
    text,
    textLength: text.length,
    excerpt: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
    contentType: 'pdfText',
    sourceName: 'PDF document'
  };
}
