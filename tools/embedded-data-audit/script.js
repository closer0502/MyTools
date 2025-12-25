const dom = {
    dropZone: document.getElementById('dropZone'),
    fileSelect: document.getElementById('fileSelect'),
    fileInput: document.getElementById('fileInput'),
    fileName: document.getElementById('fileName'),
    fileFormat: document.getElementById('fileFormat'),
    fileSize: document.getElementById('fileSize'),
    itemCount: document.getElementById('itemCount'),
    statusText: document.getElementById('statusText'),
    clearButton: document.getElementById('clearButton'),
    errorBanner: document.getElementById('errorBanner'),
    summaryPanel: document.getElementById('summaryPanel'),
    metaCount: document.getElementById('metaCount'),
    unknownCount: document.getElementById('unknownCount'),
    trailingBytes: document.getElementById('trailingBytes'),
    signatureCount: document.getElementById('signatureCount'),
    warningList: document.getElementById('warningList'),
    mainGrid: document.getElementById('mainGrid'),
    tableMeta: document.getElementById('tableMeta'),
    itemTable: document.getElementById('itemTable'),
    emptyState: document.getElementById('emptyState'),
    detailTitle: document.getElementById('detailTitle'),
    detailContent: document.getElementById('detailContent'),
    metaPanel: document.getElementById('metaPanel'),
    metaHint: document.getElementById('metaHint'),
    metaList: document.getElementById('metaList'),
    signaturePanel: document.getElementById('signaturePanel'),
    signatureHint: document.getElementById('signatureHint'),
    signatureList: document.getElementById('signatureList')
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const ID3_SIGNATURE = [0x49, 0x44, 0x33];

const PNG_KNOWN_CHUNKS = new Set([
    'IHDR', 'PLTE', 'IDAT', 'IEND', 'tEXt', 'iTXt', 'zTXt', 'iCCP', 'sRGB', 'pHYs',
    'gAMA', 'cHRM', 'bKGD', 'tRNS', 'sPLT', 'hIST', 'sBIT', 'eXIf', 'acTL', 'fcTL', 'fdAT'
]);

const PNG_META_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt', 'iCCP', 'eXIf']);

const WEBP_KNOWN_CHUNKS = new Set([
    'VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'EXIF', 'XMP ', 'ICCP'
]);

const WEBP_META_CHUNKS = new Set(['EXIF', 'XMP ', 'ICCP']);

const WAV_KNOWN_CHUNKS = new Set([
    'fmt ', 'data', 'LIST', 'INFO', 'bext', 'iXML', 'cue ', 'smpl', 'fact'
]);

const WAV_META_CHUNKS = new Set(['LIST', 'INFO', 'bext', 'iXML']);

const MP4_KNOWN_BOXES = new Set([
    'ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'uuid', 'moof', 'mfra',
    'mvhd', 'trak', 'tkhd', 'mdia', 'mdhd', 'hdlr', 'minf', 'vmhd', 'smhd',
    'dinf', 'dref', 'stbl', 'stsd', 'stts', 'ctts', 'stsc', 'stsz', 'stz2',
    'stco', 'co64', 'stss', 'udta', 'meta', 'ilst', 'mvex', 'mehd', 'trex',
    'edts', 'elst', 'sidx', 'mfhd', 'traf', 'tfhd', 'tfdt', 'trun', 'dref',
    'btrt', 'pasp', 'colr', 'clap', 'iprp', 'ipco', 'ipma', 'sinf', 'schm',
    'schi', 'name', 'data', 'cprt', 'emsg', 'pssh'
]);

const MP4_CONTAINER_BOXES = new Set([
    'moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'meta', 'ilst', 'moof',
    'traf', 'mvex', 'dinf', 'iprp', 'ipco', 'sinf', 'schi', 'mfra', 'edts'
]);

const MP4_META_BOXES = new Set(['udta', 'meta', 'ilst', 'cprt']);

const JPEG_MARKERS = {
    0x01: 'TEM',
    0xc0: 'SOF0',
    0xc1: 'SOF1',
    0xc2: 'SOF2',
    0xc3: 'SOF3',
    0xc5: 'SOF5',
    0xc6: 'SOF6',
    0xc7: 'SOF7',
    0xc9: 'SOF9',
    0xca: 'SOF10',
    0xcb: 'SOF11',
    0xcd: 'SOF13',
    0xce: 'SOF14',
    0xcf: 'SOF15',
    0xc4: 'DHT',
    0xcc: 'DAC',
    0xda: 'SOS',
    0xd8: 'SOI',
    0xd9: 'EOI',
    0xdb: 'DQT',
    0xdd: 'DRI',
    0xdc: 'DNL',
    0xde: 'DHP',
    0xdf: 'EXP',
    0xfe: 'COM'
};

const SIGNATURES = [
    { name: 'PNG', bytes: PNG_SIGNATURE },
    { name: 'JPEG', bytes: JPEG_SIGNATURE },
    { name: 'WEBP', bytes: [0x57, 0x45, 0x42, 0x50] },
    { name: 'WAVE', bytes: [0x57, 0x41, 0x56, 0x45] },
    { name: 'ID3', bytes: ID3_SIGNATURE },
    { name: 'MP4', bytes: [0x66, 0x74, 0x79, 0x70] },
    { name: 'ZIP', bytes: [0x50, 0x4b, 0x03, 0x04] },
    { name: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
    { name: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38] },
    { name: 'RIFF', bytes: RIFF_SIGNATURE }
];

const state = {
    file: null,
    bytes: null,
    items: [],
    meta: [],
    warnings: [],
    signatures: [],
    format: '-'
};

const MAX_SIGNATURE_HITS = 5;

const textDecoder = new TextDecoder('utf-8');

function decodeLatin1(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
    }
    return result;
}

function decodeUtf8(bytes) {
    try {
        return textDecoder.decode(bytes);
    } catch (error) {
        return '';
    }
}

function trimNulls(value) {
    return value.replace(/\0/g, '');
}

function formatBytes(value) {
    if (value === 0) {
        return '0 B';
    }
    if (value < 1024) {
        return `${value} B`;
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toFixed(size < 10 && unitIndex > 0 ? 2 : 1)} ${units[unitIndex]}`;
}

function formatOffset(value) {
    return `0x${value.toString(16).toUpperCase()}`;
}

function formatCount(value) {
    return value.toLocaleString('en-US');
}

function truncateText(text, max = 240) {
    if (!text) {
        return '-';
    }
    if (text.length <= max) {
        return text;
    }
    return `${text.slice(0, max)}…`;
}

function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function readUint16BE(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readUint16LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
}

function readUint64BE(bytes, offset) {
    const high = readUint32BE(bytes, offset);
    const low = readUint32BE(bytes, offset + 4);
    return (BigInt(high) << 32n) + BigInt(low);
}

function readSynchsafe(bytes, offset) {
    return ((bytes[offset] & 0x7f) << 21)
        | ((bytes[offset + 1] & 0x7f) << 14)
        | ((bytes[offset + 2] & 0x7f) << 7)
        | (bytes[offset + 3] & 0x7f);
}

function readAscii(bytes, start, length) {
    let value = '';
    for (let i = 0; i < length; i++) {
        value += String.fromCharCode(bytes[start + i]);
    }
    return value;
}

function hexPreview(bytes, start, length) {
    const end = Math.min(bytes.length, start + length);
    const chunk = [];
    for (let i = start; i < end; i++) {
        chunk.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
    }
    return chunk.join(' ');
}

function detectFormat(bytes) {
    if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
        return 'PNG';
    }
    if (bytes.length >= 3 && JPEG_SIGNATURE.every((b, i) => bytes[i] === b)) {
        return 'JPEG';
    }
    if (bytes.length >= 12 && RIFF_SIGNATURE.every((b, i) => bytes[i] === b)) {
        const riffType = readAscii(bytes, 8, 4);
        if (riffType === 'WEBP') {
            return 'WEBP';
        }
        if (riffType === 'WAVE') {
            return 'WAV';
        }
    }
    if (bytes.length >= 12 && readAscii(bytes, 4, 4) === 'ftyp') {
        return 'MP4';
    }
    if (bytes.length >= 3 && ID3_SIGNATURE.every((b, i) => bytes[i] === b)) {
        return 'MP3';
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
        return 'MP3';
    }
    return 'UNKNOWN';
}

function parsePng(bytes) {
    const items = [];
    const meta = [];
    const warnings = [];
    let offset = 8;
    let unknownCount = 0;
    let iendEnd = -1;

    while (offset + 8 <= bytes.length) {
        const length = readUint32BE(bytes, offset);
        const type = readAscii(bytes, offset + 4, 4);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const crcStart = dataEnd;
        const crcEnd = crcStart + 4;

        if (dataEnd > bytes.length || crcEnd > bytes.length) {
            warnings.push(`チャンク ${type} がファイル末尾を超えています。`);
            break;
        }

        const known = PNG_KNOWN_CHUNKS.has(type);
        if (!known) {
            unknownCount += 1;
        }

        const tags = [];
        if (PNG_META_CHUNKS.has(type)) {
            tags.push('metadata');
        }
        if (!known) {
            tags.push('unknown');
        }

        if (type === 'IEND') {
            tags.push('end');
        }

        const item = {
            kind: 'chunk',
            type,
            offset,
            dataOffset: dataStart,
            dataLength: length,
            totalLength: length + 12,
            tags,
            details: []
        };

        item.details.push({ label: 'Chunk', value: type });
        item.details.push({ label: 'Offset', value: `${formatOffset(offset)} (${offset})` });
        item.details.push({ label: 'Data Size', value: `${formatBytes(length)} (${length} B)` });
        item.details.push({ label: 'Total Size', value: `${formatBytes(item.totalLength)} (${item.totalLength} B)` });
        item.details.push({ label: 'CRC', value: formatOffset(readUint32BE(bytes, crcStart)) });

        if (PNG_META_CHUNKS.has(type)) {
            const data = bytes.slice(dataStart, dataEnd);
            const parsed = parsePngMeta(type, data, offset);
            if (parsed) {
                item.details.push(...parsed.details);
                meta.push(parsed.metaEntry);
            }
        }

        items.push(item);

        if (type === 'IEND') {
            iendEnd = crcEnd;
            break;
        }

        offset = crcEnd;
    }

    if (iendEnd === -1) {
        warnings.push('IEND チャンクが見つかりません。');
    }

    const trailingBytes = iendEnd !== -1 && iendEnd < bytes.length ? bytes.length - iendEnd : 0;
    if (trailingBytes > 0) {
        warnings.push(`IEND 以降に ${trailingBytes} バイトの余剰データがあります。`);
    }

    return {
        items,
        meta,
        warnings,
        unknownCount,
        trailingBytes,
        tableLabel: `PNG chunks: ${items.length}`
    };
}

function parsePngMeta(type, data, offset) {
    if (type === 'tEXt') {
        const parsed = parsePngTextChunk(data);
        const text = parsed.text ? trimNulls(parsed.text) : '';
        return {
            details: [
                { label: 'Keyword', value: parsed.keyword || '-' },
                { label: 'Text', value: truncateText(text) }
            ],
            metaEntry: {
                title: `tEXt: ${parsed.keyword || 'text'}`,
                detail: truncateText(text),
                size: data.length,
                offset
            }
        };
    }

    if (type === 'iTXt') {
        const parsed = parsePngInternationalText(data);
        const text = parsed.compressed ? '(compressed text)' : truncateText(parsed.text);
        return {
            details: [
                { label: 'Keyword', value: parsed.keyword || '-' },
                { label: 'Compressed', value: parsed.compressed ? 'yes' : 'no' },
                { label: 'Language', value: parsed.languageTag || '-' },
                { label: 'Translated', value: parsed.translatedKeyword || '-' },
                { label: 'Text', value: text }
            ],
            metaEntry: {
                title: `iTXt: ${parsed.keyword || 'text'}`,
                detail: text,
                size: data.length,
                offset
            }
        };
    }

    if (type === 'zTXt') {
        const parsed = parsePngCompressedText(data);
        return {
            details: [
                { label: 'Keyword', value: parsed.keyword || '-' },
                { label: 'Compression', value: parsed.compressionMethod },
                { label: 'Text', value: '(compressed text)' }
            ],
            metaEntry: {
                title: `zTXt: ${parsed.keyword || 'text'}`,
                detail: 'compressed text',
                size: data.length,
                offset
            }
        };
    }

    if (type === 'iCCP') {
        const parsed = parsePngIccProfile(data);
        return {
            details: [
                { label: 'Profile Name', value: parsed.profileName || '-' },
                { label: 'Compression', value: parsed.compressionMethod },
                { label: 'Profile Size', value: `${formatBytes(parsed.profileSize)} (${parsed.profileSize} B)` }
            ],
            metaEntry: {
                title: `iCCP: ${parsed.profileName || 'profile'}`,
                detail: `${formatBytes(parsed.profileSize)} profile`,
                size: data.length,
                offset
            }
        };
    }

    if (type === 'eXIf') {
        return {
            details: [{ label: 'EXIF Size', value: `${formatBytes(data.length)} (${data.length} B)` }],
            metaEntry: {
                title: 'eXIf: EXIF data',
                detail: `${formatBytes(data.length)} EXIF`,
                size: data.length,
                offset
            }
        };
    }

    return null;
}

function parsePngTextChunk(data) {
    const { text: keyword, nextIndex } = readNullTerminated(data, 0, decodeLatin1);
    const text = decodeLatin1(data.slice(nextIndex));
    return { keyword, text };
}

function parsePngCompressedText(data) {
    const { text: keyword, nextIndex } = readNullTerminated(data, 0, decodeLatin1);
    const methodByte = data[nextIndex];
    const compressionMethod = methodByte === 0 ? 'deflate' : methodByte === undefined ? 'unknown' : `method ${methodByte}`;
    return {
        keyword,
        compressionMethod
    };
}

function parsePngInternationalText(data) {
    const keywordPart = readNullTerminated(data, 0, decodeLatin1);
    const compressionFlag = data[keywordPart.nextIndex] || 0;
    const compressionMethod = data[keywordPart.nextIndex + 1] || 0;
    const languagePart = readNullTerminated(data, keywordPart.nextIndex + 2, decodeLatin1);
    const translatedPart = readNullTerminated(data, languagePart.nextIndex, decodeUtf8);
    const textBytes = data.slice(translatedPart.nextIndex);
    const text = compressionFlag === 0 ? decodeUtf8(textBytes) : '';

    return {
        keyword: keywordPart.text,
        compressed: compressionFlag === 1,
        compressionMethod,
        languageTag: languagePart.text,
        translatedKeyword: translatedPart.text,
        text
    };
}

function parsePngIccProfile(data) {
    const keywordPart = readNullTerminated(data, 0, decodeLatin1);
    const methodByte = data[keywordPart.nextIndex];
    const compressionMethod = methodByte === 0 ? 'deflate' : methodByte === undefined ? 'unknown' : `method ${methodByte}`;
    const profileSize = Math.max(0, data.length - keywordPart.nextIndex - 1);
    return {
        profileName: keywordPart.text,
        compressionMethod,
        profileSize
    };
}

function readNullTerminated(data, startIndex, decoder) {
    let index = startIndex;
    while (index < data.length && data[index] !== 0) {
        index += 1;
    }
    const text = decoder(data.slice(startIndex, index));
    return {
        text: trimNulls(text),
        nextIndex: Math.min(index + 1, data.length)
    };
}

function parseJpeg(bytes) {
    const items = [];
    const meta = [];
    const warnings = [];
    let unknownCount = 0;

    if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        warnings.push('SOI が見つかりません。JPEG ではない可能性があります。');
    } else {
        items.push(buildJpegItem('SOI', 0, 0, 2, ['info']));
    }

    let position = 2;
    let eoiEnd = -1;

    while (position < bytes.length) {
        if (bytes[position] !== 0xff) {
            warnings.push(`予期しないバイトが ${formatOffset(position)} にあります。`);
            break;
        }

        const markerStart = position;
        while (position < bytes.length && bytes[position] === 0xff) {
            position += 1;
        }

        if (position >= bytes.length) {
            break;
        }

        const marker = bytes[position];
        position += 1;
        const name = markerName(marker);

        if (marker === 0xd9) {
            items.push(buildJpegItem('EOI', markerStart, 0, 2, ['end']));
            eoiEnd = markerStart + 2;
            break;
        }

        if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            const tag = marker >= 0xd0 && marker <= 0xd7 ? 'restart' : 'info';
            items.push(buildJpegItem(name, markerStart, 0, 2, [tag]));
            continue;
        }

        if (position + 1 >= bytes.length) {
            warnings.push('セグメント長が取得できません。');
            break;
        }

        const segmentLength = readUint16BE(bytes, position);
        const dataStart = position + 2;
        const dataEnd = dataStart + segmentLength - 2;

        if (dataEnd > bytes.length) {
            warnings.push(`セグメント ${name} がファイル末尾を超えています。`);
            break;
        }

        const data = bytes.slice(dataStart, dataEnd);
        const tags = [];
        const item = {
            kind: 'marker',
            type: name,
            offset: markerStart,
            dataOffset: dataStart,
            dataLength: data.length,
            totalLength: segmentLength + 2,
            tags,
            details: []
        };

        if (name === 'SOS') {
            tags.push('info');
        }

        if (name.startsWith('APP') || name === 'COM') {
            const metaEntry = parseJpegMeta(name, data, item.details, tags, markerStart);
            if (metaEntry) {
                meta.push(metaEntry);
                tags.push('metadata');
            }
        }

        if (name === 'UNKNOWN') {
            unknownCount += 1;
            tags.push('unknown');
        }

        item.details.push({ label: 'Marker', value: name });
        item.details.push({ label: 'Offset', value: `${formatOffset(markerStart)} (${markerStart})` });
        item.details.push({ label: 'Data Size', value: `${formatBytes(data.length)} (${data.length} B)` });
        item.details.push({ label: 'Total Size', value: `${formatBytes(item.totalLength)} (${item.totalLength} B)` });

        items.push(item);

        position = dataEnd;

        if (name === 'SOS') {
            const scanEnd = findScanEnd(bytes, position);
            if (scanEnd === -1) {
                warnings.push('SOS 以降のスキャンデータが不完全です。');
                break;
            }
            const scanLength = scanEnd - position;
            items.push({
                kind: 'scan',
                type: 'Scan Data',
                offset: position,
                dataOffset: position,
                dataLength: scanLength,
                totalLength: scanLength,
                tags: ['info'],
                details: [
                    { label: 'Section', value: 'Scan Data' },
                    { label: 'Offset', value: `${formatOffset(position)} (${position})` },
                    { label: 'Size', value: `${formatBytes(scanLength)} (${scanLength} B)` }
                ]
            });
            position = scanEnd;
        }
    }

    if (eoiEnd === -1) {
        warnings.push('EOI が見つかりません。');
    }

    const trailingBytes = eoiEnd !== -1 && eoiEnd < bytes.length ? bytes.length - eoiEnd : 0;
    if (trailingBytes > 0) {
        warnings.push(`EOI 以降に ${trailingBytes} バイトの余剰データがあります。`);
    }

    return {
        items,
        meta,
        warnings,
        unknownCount,
        trailingBytes,
        tableLabel: `JPEG segments: ${items.length}`
    };
}

function markerName(marker) {
    if (marker >= 0xe0 && marker <= 0xef) {
        return `APP${marker - 0xe0}`;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
        return `RST${marker - 0xd0}`;
    }
    return JPEG_MARKERS[marker] || 'UNKNOWN';
}

function buildJpegItem(name, offset, dataLength, totalLength, tags) {
    return {
        kind: 'marker',
        type: name,
        offset,
        dataOffset: offset,
        dataLength,
        totalLength,
        tags,
        details: [
            { label: 'Marker', value: name },
            { label: 'Offset', value: `${formatOffset(offset)} (${offset})` },
            { label: 'Data Size', value: `${formatBytes(dataLength)} (${dataLength} B)` },
            { label: 'Total Size', value: `${formatBytes(totalLength)} (${totalLength} B)` }
        ]
    };
}

function parseJpegMeta(name, data, details, tags, offset) {
    if (name === 'APP1') {
        const exifHeader = 'Exif\0\0';
        const xmpHeader = 'http://ns.adobe.com/xap/1.0/\0';
        const headerText = decodeLatin1(data.slice(0, 32));
        if (headerText.startsWith(exifHeader)) {
            details.push({ label: 'APP1', value: 'EXIF data' });
            return {
                title: 'EXIF (APP1)',
                detail: `${formatBytes(data.length)} EXIF`,
                size: data.length,
                offset
            };
        }
        if (headerText.startsWith(xmpHeader)) {
            const xmpText = decodeUtf8(data.slice(xmpHeader.length));
            details.push({ label: 'APP1', value: 'XMP data' });
            details.push({ label: 'XMP', value: truncateText(xmpText, 200) });
            return {
                title: 'XMP (APP1)',
                detail: truncateText(xmpText, 200),
                size: data.length,
                offset
            };
        }
    }

    if (name === 'APP2') {
        const headerText = decodeLatin1(data.slice(0, 16));
        if (headerText.startsWith('ICC_PROFILE\0')) {
            details.push({ label: 'APP2', value: 'ICC profile' });
            return {
                title: 'ICC Profile (APP2)',
                detail: `${formatBytes(data.length)} profile`,
                size: data.length,
                offset
            };
        }
    }

    if (name === 'APP13') {
        const headerText = decodeLatin1(data.slice(0, 16));
        if (headerText.startsWith('Photoshop 3.0\0')) {
            details.push({ label: 'APP13', value: 'Photoshop IRB' });
            return {
                title: 'Photoshop/IRB (APP13)',
                detail: `${formatBytes(data.length)} data`,
                size: data.length,
                offset
            };
        }
    }

    if (name === 'COM') {
        const comment = decodeLatin1(data);
        details.push({ label: 'Comment', value: truncateText(trimNulls(comment)) });
        return {
            title: 'COM (comment)',
            detail: truncateText(trimNulls(comment)),
            size: data.length,
            offset
        };
    }

    if (name === 'APP0') {
        const headerText = decodeLatin1(data.slice(0, 8));
        if (headerText.startsWith('JFIF\0')) {
            details.push({ label: 'APP0', value: 'JFIF header' });
            tags.push('info');
        }
    }

    return null;
}

function findScanEnd(bytes, start) {
    let position = start;
    while (position < bytes.length - 1) {
        if (bytes[position] === 0xff) {
            const next = bytes[position + 1];
            if (next === 0x00) {
                position += 2;
                continue;
            }
            if (next >= 0xd0 && next <= 0xd7) {
                position += 2;
                continue;
            }
            return position;
        }
        position += 1;
    }
    return -1;
}

function parseRiffChunks(bytes, riffType, knownChunks, metaChunks, chunkParser) {
    const items = [];
    const meta = [];
    const warnings = [];
    let unknownCount = 0;

    if (bytes.length < 12) {
        warnings.push('RIFF ヘッダーが不足しています。');
        return {
            items,
            meta,
            warnings,
            unknownCount,
            trailingBytes: 0,
            tableLabel: `${riffType} chunks: 0`
        };
    }

    const riffId = readAscii(bytes, 0, 4);
    const declaredSize = readUint32LE(bytes, 4);
    const format = readAscii(bytes, 8, 4);
    const expectedEnd = declaredSize + 8;
    const parseEnd = Math.min(bytes.length, expectedEnd);

    if (riffId !== 'RIFF') {
        warnings.push('RIFF 署名が見つかりません。');
    }
    if (format !== riffType) {
        warnings.push(`RIFF タイプが ${format} です。`);
    }
    if (expectedEnd > bytes.length) {
        warnings.push('RIFF サイズが実ファイルより大きい可能性があります。');
    }

    items.push({
        kind: 'riff',
        type: 'RIFF',
        offset: 0,
        dataOffset: 8,
        dataLength: 4,
        totalLength: 12,
        tags: ['info'],
        details: [
            { label: 'Container', value: `RIFF/${format}` },
            { label: 'Declared Size', value: `${formatBytes(declaredSize)} (${declaredSize} B)` },
            { label: 'File Size', value: `${formatBytes(bytes.length)} (${bytes.length} B)` }
        ]
    });

    let offset = 12;
    while (offset + 8 <= parseEnd) {
        const type = readAscii(bytes, offset, 4);
        const size = readUint32LE(bytes, offset + 4);
        const dataStart = offset + 8;
        const dataEnd = dataStart + size;
        const paddedEnd = dataEnd + (size % 2);

        if (dataEnd > bytes.length) {
            warnings.push(`チャンク ${type} がファイル末尾を超えています。`);
            break;
        }

        const known = knownChunks.has(type);
        if (!known) {
            unknownCount += 1;
        }

        const tags = [];
        if (metaChunks.has(type)) {
            tags.push('metadata');
        }
        if (!known) {
            tags.push('unknown');
        }

        const item = {
            kind: 'chunk',
            type,
            offset,
            dataOffset: dataStart,
            dataLength: size,
            totalLength: size + 8,
            tags,
            details: [
                { label: 'Chunk', value: type },
                { label: 'Offset', value: `${formatOffset(offset)} (${offset})` },
                { label: 'Data Size', value: `${formatBytes(size)} (${size} B)` },
                { label: 'Total Size', value: `${formatBytes(size + 8)} (${size + 8} B)` }
            ]
        };

        if (size % 2 === 1) {
            item.details.push({ label: 'Padding', value: '1 byte' });
        }

        if (chunkParser) {
            const parsed = chunkParser(type, bytes.slice(dataStart, dataEnd), offset, dataStart);
            if (parsed) {
                if (parsed.details) {
                    item.details.push(...parsed.details);
                }
                if (parsed.metaEntry) {
                    meta.push(parsed.metaEntry);
                }
            }
        }

        items.push(item);
        offset = paddedEnd;
    }

    const trailingBytes = bytes.length > parseEnd ? bytes.length - parseEnd : 0;
    if (trailingBytes > 0) {
        warnings.push(`RIFF 終端以降に ${trailingBytes} バイトの余剰データがあります。`);
    }

    return {
        items,
        meta,
        warnings,
        unknownCount,
        trailingBytes,
        tableLabel: `${riffType} chunks: ${items.length}`
    };
}

function parseWebp(bytes) {
    return parseRiffChunks(bytes, 'WEBP', WEBP_KNOWN_CHUNKS, WEBP_META_CHUNKS, (type, data, offset) => {
        if (type === 'EXIF') {
            return {
                details: [{ label: 'EXIF Size', value: `${formatBytes(data.length)} (${data.length} B)` }],
                metaEntry: {
                    title: 'EXIF (WEBP)',
                    detail: `${formatBytes(data.length)} EXIF`,
                    size: data.length,
                    offset
                }
            };
        }
        if (type === 'XMP ') {
            const text = decodeUtf8(data);
            return {
                details: [{ label: 'XMP', value: truncateText(text, 200) }],
                metaEntry: {
                    title: 'XMP (WEBP)',
                    detail: truncateText(text, 200),
                    size: data.length,
                    offset
                }
            };
        }
        if (type === 'ICCP') {
            return {
                details: [{ label: 'ICC Profile', value: `${formatBytes(data.length)} (${data.length} B)` }],
                metaEntry: {
                    title: 'ICC Profile (WEBP)',
                    detail: `${formatBytes(data.length)} profile`,
                    size: data.length,
                    offset
                }
            };
        }
        if (type === 'VP8X' && data.length >= 10) {
            const width = 1 + (data[4] | (data[5] << 8) | (data[6] << 16));
            const height = 1 + (data[7] | (data[8] << 8) | (data[9] << 16));
            return {
                details: [
                    { label: 'Canvas', value: `${width} x ${height}` },
                    { label: 'Flags', value: `0x${data[0].toString(16).padStart(2, '0').toUpperCase()}` }
                ]
            };
        }
        return null;
    });
}

function parseWav(bytes) {
    return parseRiffChunks(bytes, 'WAVE', WAV_KNOWN_CHUNKS, WAV_META_CHUNKS, (type, data, offset) => {
        if (type === 'fmt ' && data.length >= 16) {
            const audioFormat = readUint16LE(data, 0);
            const channels = readUint16LE(data, 2);
            const sampleRate = readUint32LE(data, 4);
            const byteRate = readUint32LE(data, 8);
            const blockAlign = readUint16LE(data, 12);
            const bitsPerSample = readUint16LE(data, 14);
            return {
                details: [
                    { label: 'Audio Format', value: audioFormat.toString() },
                    { label: 'Channels', value: channels.toString() },
                    { label: 'Sample Rate', value: `${sampleRate} Hz` },
                    { label: 'Byte Rate', value: `${byteRate} B/s` },
                    { label: 'Block Align', value: `${blockAlign} B` },
                    { label: 'Bits Per Sample', value: bitsPerSample.toString() }
                ]
            };
        }
        if (type === 'LIST' && data.length >= 4) {
            const listType = readAscii(data, 0, 4);
            return {
                details: [{ label: 'List Type', value: listType }],
                metaEntry: WAV_META_CHUNKS.has(type)
                    ? {
                        title: `LIST/${listType}`,
                        detail: `${formatBytes(data.length)} list`,
                        size: data.length,
                        offset
                    }
                    : null
            };
        }
        if (type === 'iXML') {
            const text = decodeUtf8(data);
            return {
                details: [{ label: 'iXML', value: truncateText(text, 200) }],
                metaEntry: {
                    title: 'iXML',
                    detail: truncateText(text, 200),
                    size: data.length,
                    offset
                }
            };
        }
        if (type === 'bext') {
            const text = decodeLatin1(data.slice(0, 256));
            return {
                details: [{ label: 'BEXT', value: truncateText(trimNulls(text), 200) }],
                metaEntry: {
                    title: 'BEXT',
                    detail: truncateText(trimNulls(text), 200),
                    size: data.length,
                    offset
                }
            };
        }
        return null;
    });
}

function parseMp3(bytes) {
    const items = [];
    const meta = [];
    const warnings = [];
    let unknownCount = 0;

    let offset = 0;
    let id3v2Size = 0;
    if (bytes.length >= 10 && ID3_SIGNATURE.every((b, i) => bytes[i] === b)) {
        const major = bytes[3];
        const minor = bytes[4];
        const flags = bytes[5];
        const tagSize = readSynchsafe(bytes, 6);
        id3v2Size = tagSize + 10;
        if (id3v2Size > bytes.length) {
            warnings.push('ID3v2 タグサイズがファイル末尾を超えています。');
            id3v2Size = bytes.length;
        }
        items.push({
            kind: 'tag',
            type: 'ID3v2',
            offset: 0,
            dataOffset: 10,
            dataLength: Math.max(0, id3v2Size - 10),
            totalLength: id3v2Size,
            tags: ['metadata'],
            details: [
                { label: 'Tag', value: 'ID3v2' },
                { label: 'Version', value: `2.${major}.${minor}` },
                { label: 'Flags', value: `0x${flags.toString(16).padStart(2, '0').toUpperCase()}` },
                { label: 'Size', value: `${formatBytes(tagSize)} (${tagSize} B)` }
            ]
        });
        meta.push({
            title: `ID3v2.${major}.${minor}`,
            detail: `${formatBytes(tagSize)} tag`,
            size: tagSize,
            offset: 0
        });
        offset = id3v2Size;
    }

    let apeOffset = findApeTag(bytes);
    let id3v1Offset = -1;
    if (bytes.length >= 128 && readAscii(bytes, bytes.length - 128, 3) === 'TAG') {
        id3v1Offset = bytes.length - 128;
    }

    let audioEnd = bytes.length;
    if (apeOffset !== -1) {
        audioEnd = Math.min(audioEnd, apeOffset);
    }
    if (id3v1Offset !== -1) {
        audioEnd = Math.min(audioEnd, id3v1Offset);
    }

    if (audioEnd > offset) {
        items.push({
            kind: 'audio',
            type: 'MPEG Audio',
            offset,
            dataOffset: offset,
            dataLength: audioEnd - offset,
            totalLength: audioEnd - offset,
            tags: ['info'],
            details: [
                { label: 'Section', value: 'Audio Data' },
                { label: 'Offset', value: `${formatOffset(offset)} (${offset})` },
                { label: 'Size', value: `${formatBytes(audioEnd - offset)} (${audioEnd - offset} B)` }
            ]
        });
    }

    if (apeOffset !== -1 && apeOffset + 32 <= bytes.length) {
        const version = readUint32LE(bytes, apeOffset + 8);
        const size = readUint32LE(bytes, apeOffset + 12);
        const itemCount = readUint32LE(bytes, apeOffset + 16);
        items.push({
            kind: 'tag',
            type: 'APEv2',
            offset: apeOffset,
            dataOffset: apeOffset + 32,
            dataLength: Math.max(0, size - 32),
            totalLength: size,
            tags: ['metadata'],
            details: [
                { label: 'Tag', value: 'APEv2' },
                { label: 'Version', value: version.toString() },
                { label: 'Items', value: itemCount.toString() },
                { label: 'Size', value: `${formatBytes(size)} (${size} B)` }
            ]
        });
        meta.push({
            title: 'APEv2',
            detail: `${formatBytes(size)} tag`,
            size,
            offset: apeOffset
        });
    }

    if (id3v1Offset !== -1) {
        const title = trimNulls(decodeLatin1(bytes.slice(id3v1Offset + 3, id3v1Offset + 33)));
        const artist = trimNulls(decodeLatin1(bytes.slice(id3v1Offset + 33, id3v1Offset + 63)));
        const album = trimNulls(decodeLatin1(bytes.slice(id3v1Offset + 63, id3v1Offset + 93)));
        const year = trimNulls(decodeLatin1(bytes.slice(id3v1Offset + 93, id3v1Offset + 97)));
        items.push({
            kind: 'tag',
            type: 'ID3v1',
            offset: id3v1Offset,
            dataOffset: id3v1Offset,
            dataLength: 128,
            totalLength: 128,
            tags: ['metadata'],
            details: [
                { label: 'Tag', value: 'ID3v1' },
                { label: 'Title', value: title || '-' },
                { label: 'Artist', value: artist || '-' },
                { label: 'Album', value: album || '-' },
                { label: 'Year', value: year || '-' }
            ]
        });
        meta.push({
            title: 'ID3v1',
            detail: [title, artist, album].filter(Boolean).join(' / ') || 'tag',
            size: 128,
            offset: id3v1Offset
        });
    }

    return {
        items,
        meta,
        warnings,
        unknownCount,
        trailingBytes: 0,
        tableLabel: `MP3 sections: ${items.length}`
    };
}

function findApeTag(bytes) {
    const signature = 'APETAGEX';
    const start = Math.max(0, bytes.length - 512);
    for (let i = bytes.length - 32; i >= start; i -= 1) {
        if (readAscii(bytes, i, 8) === signature) {
            return i;
        }
    }
    return -1;
}

function parseMp4(bytes) {
    const items = [];
    const meta = [];
    const warnings = [];
    let unknownCount = 0;

    const topLevel = parseMp4Boxes(bytes, 0, bytes.length, '');
    items.push(...topLevel.items);
    meta.push(...topLevel.meta);
    warnings.push(...topLevel.warnings);
    unknownCount += topLevel.unknownCount;

    const trailingBytes = topLevel.lastEnd < bytes.length ? bytes.length - topLevel.lastEnd : 0;
    if (trailingBytes > 0) {
        warnings.push(`MP4 終端以降に ${trailingBytes} バイトの余剰データがあります。`);
    }

    return {
        items,
        meta,
        warnings,
        unknownCount,
        trailingBytes,
        tableLabel: `MP4 boxes: ${items.length}`
    };
}

function parseMp4Boxes(bytes, start, end, path) {
    const items = [];
    const meta = [];
    const warnings = [];
    let unknownCount = 0;
    let offset = start;
    let lastEnd = start;

    while (offset + 8 <= end) {
        const size32 = readUint32BE(bytes, offset);
        const type = readAscii(bytes, offset + 4, 4);
        let headerSize = 8;
        let size = size32;

        if (size32 === 1) {
            if (offset + 16 > end) {
                warnings.push(`box ${type} のサイズが取得できません。`);
                break;
            }
            const size64 = readUint64BE(bytes, offset + 8);
            if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) {
                warnings.push(`box ${type} のサイズが大きすぎます。`);
                break;
            }
            size = Number(size64);
            headerSize = 16;
        } else if (size32 === 0) {
            size = end - offset;
        }

        if (size < headerSize) {
            warnings.push(`box ${type} のサイズが不正です。`);
            break;
        }

        const boxEnd = offset + size;
        if (boxEnd > end) {
            warnings.push(`box ${type} がファイル末尾を超えています。`);
            break;
        }

        const boxPath = path ? `${path}/${type}` : type;
        const known = MP4_KNOWN_BOXES.has(type);
        if (!known) {
            unknownCount += 1;
        }

        const tags = [];
        if (MP4_META_BOXES.has(type)) {
            tags.push('metadata');
        }
        if (!known) {
            tags.push('unknown');
        }

        const item = {
            kind: 'box',
            type: boxPath,
            offset,
            dataOffset: offset + headerSize,
            dataLength: size - headerSize,
            totalLength: size,
            tags,
            details: [
                { label: 'Box', value: type },
                { label: 'Path', value: boxPath },
                { label: 'Offset', value: `${formatOffset(offset)} (${offset})` },
                { label: 'Size', value: `${formatBytes(size)} (${size} B)` }
            ]
        };

        if (size32 === 1) {
            item.details.push({ label: 'Size Type', value: '64-bit' });
        } else if (size32 === 0) {
            item.details.push({ label: 'Size Type', value: 'to end' });
        }

        items.push(item);

        if (MP4_META_BOXES.has(type)) {
            meta.push({
                title: `MP4 ${boxPath}`,
                detail: `${formatBytes(size)} box`,
                size,
                offset
            });
        }

        let childStart = offset + headerSize;
        if (type === 'meta') {
            childStart += 4;
        }
        if (MP4_CONTAINER_BOXES.has(type) && childStart < boxEnd) {
            const child = parseMp4Boxes(bytes, childStart, boxEnd, boxPath);
            items.push(...child.items);
            meta.push(...child.meta);
            warnings.push(...child.warnings);
            unknownCount += child.unknownCount;
        }

        offset = boxEnd;
        lastEnd = boxEnd;
    }

    return {
        items,
        meta,
        warnings,
        unknownCount,
        lastEnd
    };
}

function scanSignatures(bytes) {
    const hits = [];
    for (const signature of SIGNATURES) {
        let found = 0;
        for (let i = 0; i <= bytes.length - signature.bytes.length; i++) {
            let matched = true;
            for (let j = 0; j < signature.bytes.length; j++) {
                if (bytes[i + j] !== signature.bytes[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) {
                hits.push({ name: signature.name, offset: i, length: signature.bytes.length });
                found += 1;
                if (found >= MAX_SIGNATURE_HITS) {
                    break;
                }
            }
        }
    }
    return hits;
}

function isHeaderSignature(hit, format) {
    if (format === 'PNG' && hit.name === 'PNG' && hit.offset === 0) {
        return true;
    }
    if (format === 'JPEG' && hit.name === 'JPEG' && hit.offset === 0) {
        return true;
    }
    if (format === 'WEBP') {
        return (hit.name === 'RIFF' && hit.offset === 0) || (hit.name === 'WEBP' && hit.offset === 8);
    }
    if (format === 'WAV') {
        return (hit.name === 'RIFF' && hit.offset === 0) || (hit.name === 'WAVE' && hit.offset === 8);
    }
    if (format === 'MP3' && hit.name === 'ID3' && hit.offset === 0) {
        return true;
    }
    if (format === 'MP4' && hit.name === 'MP4' && hit.offset === 4) {
        return true;
    }
    return false;
}

function setStatus(message) {
    dom.statusText.textContent = message;
}

function showError(message) {
    dom.errorBanner.textContent = message;
    dom.errorBanner.classList.remove('hidden');
}

function clearError() {
    dom.errorBanner.textContent = '';
    dom.errorBanner.classList.add('hidden');
}

function resetUI() {
    state.items = [];
    state.meta = [];
    state.warnings = [];
    state.signatures = [];
    state.format = '-';

    dom.fileFormat.textContent = '-';
    dom.fileSize.textContent = '-';
    dom.itemCount.textContent = '0';
    dom.fileName.textContent = 'ファイル未選択';
    dom.warningList.innerHTML = '';
    dom.itemTable.innerHTML = '';
    dom.detailContent.innerHTML = '<div class="detail-placeholder">項目を選択すると詳細が表示されます。</div>';
    dom.detailTitle.textContent = '-';
    dom.metaList.innerHTML = '';
    dom.signatureList.innerHTML = '';
    dom.summaryPanel.classList.add('hidden');
    dom.mainGrid.classList.add('hidden');
    dom.metaPanel.classList.add('hidden');
    dom.signaturePanel.classList.add('hidden');
    dom.emptyState.classList.add('hidden');
    setStatus('待機');
    clearError();
}

async function handleFile(file) {
    resetUI();
    if (!file) {
        return;
    }

    dom.fileName.textContent = file.name;
    dom.fileSize.textContent = formatBytes(file.size);
    setStatus('読み込み中');

    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const format = detectFormat(bytes);

        if (format === 'UNKNOWN') {
            showError('対応外の形式です。');
            setStatus('失敗');
            return;
        }

        state.format = format;
        dom.fileFormat.textContent = format;

        let result = null;
        if (format === 'PNG') {
            result = parsePng(bytes);
        } else if (format === 'JPEG') {
            result = parseJpeg(bytes);
        } else if (format === 'WEBP') {
            result = parseWebp(bytes);
        } else if (format === 'WAV') {
            result = parseWav(bytes);
        } else if (format === 'MP3') {
            result = parseMp3(bytes);
        } else if (format === 'MP4') {
            result = parseMp4(bytes);
        }

        if (!result) {
            showError('解析できない形式です。');
            setStatus('失敗');
            return;
        }
        const signatures = scanSignatures(bytes);

        state.items = result.items;
        state.meta = result.meta;
        state.warnings = result.warnings;
        state.signatures = signatures;

        dom.itemCount.textContent = formatCount(result.items.length);
        dom.metaCount.textContent = formatCount(result.meta.length);
        dom.unknownCount.textContent = formatCount(result.unknownCount);
        dom.trailingBytes.textContent = formatBytes(result.trailingBytes);
        dom.signatureCount.textContent = formatCount(signatures.filter((hit) => !isHeaderSignature(hit, format)).length);
        dom.tableMeta.textContent = result.tableLabel;

        renderWarnings(result.warnings);
        renderTable(result.items, bytes);
        renderMeta(result.meta);
        renderSignatures(signatures, format);

        dom.summaryPanel.classList.remove('hidden');
        dom.mainGrid.classList.remove('hidden');
        if (result.meta.length > 0) {
            dom.metaPanel.classList.remove('hidden');
            dom.metaHint.textContent = `${result.meta.length} 件`;
        }
        if (signatures.length > 0) {
            dom.signaturePanel.classList.remove('hidden');
            dom.signatureHint.textContent = `${signatures.length} 件`;
        }

        setStatus('解析完了');
    } catch (error) {
        showError('ファイルの解析に失敗しました。');
        setStatus('失敗');
    }
}

function renderWarnings(warnings) {
    dom.warningList.innerHTML = '';
    if (!warnings.length) {
        return;
    }
    const fragment = document.createDocumentFragment();
    warnings.forEach((warning) => {
        const item = document.createElement('div');
        item.className = 'warning-item';
        item.textContent = warning;
        fragment.appendChild(item);
    });
    dom.warningList.appendChild(fragment);
}

function renderTable(items, bytes) {
    dom.itemTable.innerHTML = '';
    if (!items.length) {
        dom.emptyState.classList.remove('hidden');
        return;
    }
    dom.emptyState.classList.add('hidden');
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
        const row = document.createElement('tr');
        row.dataset.index = index;

        const typeCell = document.createElement('td');
        typeCell.innerHTML = `<span class="mono">${item.type}</span>`;

        const offsetCell = document.createElement('td');
        offsetCell.innerHTML = `<span class="mono">${formatOffset(item.offset)}</span>`;

        const sizeCell = document.createElement('td');
        sizeCell.textContent = formatBytes(item.totalLength || item.dataLength || 0);

        const noteCell = document.createElement('td');
        noteCell.appendChild(renderTags(item.tags));

        row.appendChild(typeCell);
        row.appendChild(offsetCell);
        row.appendChild(sizeCell);
        row.appendChild(noteCell);
        row.addEventListener('click', () => {
            selectItem(index, items, bytes);
        });
        fragment.appendChild(row);
    });
    dom.itemTable.appendChild(fragment);

    selectItem(0, items, bytes);
}

function renderTags(tags) {
    const wrap = document.createElement('div');
    wrap.className = 'tag-wrap';
    if (!tags || tags.length === 0) {
        wrap.textContent = '-';
        return wrap;
    }
    tags.forEach((tag) => {
        const span = document.createElement('span');
        if (tag === 'metadata') {
            span.className = 'note-tag note-tag--meta';
            span.textContent = 'metadata';
        } else if (tag === 'unknown') {
            span.className = 'note-tag note-tag--unknown';
            span.textContent = 'unknown';
        } else {
            span.className = 'note-tag note-tag--info';
            span.textContent = tag;
        }
        wrap.appendChild(span);
    });
    return wrap;
}

function selectItem(index, items, bytes) {
    const rows = dom.itemTable.querySelectorAll('tr');
    rows.forEach((row) => row.classList.remove('is-selected'));
    const selectedRow = dom.itemTable.querySelector(`tr[data-index="${index}"]`);
    if (selectedRow) {
        selectedRow.classList.add('is-selected');
    }
    const item = items[index];
    if (!item) {
        return;
    }
    renderDetail(item, bytes);
}

function renderDetail(item, bytes) {
    dom.detailTitle.textContent = item.type;
    const content = document.createElement('div');
    content.className = 'detail-content';

    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    item.details.forEach((entry) => {
        const label = document.createElement('div');
        label.className = 'detail-label';
        label.textContent = entry.label;
        const value = document.createElement('div');
        value.className = 'detail-value';
        value.textContent = entry.value;
        grid.appendChild(label);
        grid.appendChild(value);
    });
    content.appendChild(grid);

    if (item.dataLength > 0) {
        const preview = document.createElement('pre');
        preview.className = 'detail-pre';
        preview.textContent = hexPreview(bytes, item.dataOffset, Math.min(item.dataLength, 64));
        content.appendChild(preview);
    }

    dom.detailContent.innerHTML = '';
    dom.detailContent.appendChild(content);
}

function renderMeta(meta) {
    dom.metaList.innerHTML = '';
    if (!meta.length) {
        dom.metaPanel.classList.add('hidden');
        return;
    }
    const fragment = document.createDocumentFragment();
    meta.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'detail-item';
        const title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = entry.title;
        const detail = document.createElement('div');
        detail.textContent = entry.detail;
        const metaInfo = document.createElement('div');
        metaInfo.className = 'item-meta';
        metaInfo.textContent = `${formatBytes(entry.size)} · offset ${formatOffset(entry.offset || 0)}`;
        item.appendChild(title);
        item.appendChild(detail);
        item.appendChild(metaInfo);
        fragment.appendChild(item);
    });
    dom.metaList.appendChild(fragment);
}

function renderSignatures(signatures, format) {
    dom.signatureList.innerHTML = '';
    if (!signatures.length) {
        dom.signaturePanel.classList.add('hidden');
        return;
    }
    const fragment = document.createDocumentFragment();
    signatures.forEach((hit) => {
        const item = document.createElement('div');
        item.className = 'detail-item';
        const title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = hit.name;
        const detail = document.createElement('div');
        const note = isHeaderSignature(hit, format) ? 'file header' : 'embedded candidate';
        detail.textContent = note;
        const meta = document.createElement('div');
        meta.className = 'item-meta';
        meta.textContent = `offset ${formatOffset(hit.offset)} · ${hit.length} bytes`;
        item.appendChild(title);
        item.appendChild(detail);
        item.appendChild(meta);
        fragment.appendChild(item);
    });
    dom.signatureList.appendChild(fragment);
}

function handleDragOver(event) {
    event.preventDefault();
    dom.dropZone.classList.add('is-dragover');
}

function handleDragLeave() {
    dom.dropZone.classList.remove('is-dragover');
}

function handleDrop(event) {
    event.preventDefault();
    dom.dropZone.classList.remove('is-dragover');
    if (!event.dataTransfer || !event.dataTransfer.files.length) {
        return;
    }
    handleFile(event.dataTransfer.files[0]);
}

function bindEvents() {
    dom.fileSelect.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleFile(file);
        }
    });
    dom.clearButton.addEventListener('click', () => {
        dom.fileInput.value = '';
        resetUI();
    });

    dom.dropZone.addEventListener('dragover', handleDragOver);
    dom.dropZone.addEventListener('dragleave', handleDragLeave);
    dom.dropZone.addEventListener('drop', handleDrop);
    dom.dropZone.addEventListener('dragend', handleDragLeave);
}

bindEvents();
resetUI();
