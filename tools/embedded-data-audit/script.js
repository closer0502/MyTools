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

const PNG_KNOWN_CHUNKS = new Set([
    'IHDR', 'PLTE', 'IDAT', 'IEND', 'tEXt', 'iTXt', 'zTXt', 'iCCP', 'sRGB', 'pHYs',
    'gAMA', 'cHRM', 'bKGD', 'tRNS', 'sPLT', 'hIST', 'sBIT', 'eXIf', 'acTL', 'fcTL', 'fdAT'
]);

const PNG_META_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt', 'iCCP', 'eXIf']);

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
    { name: 'ZIP', bytes: [0x50, 0x4b, 0x03, 0x04] },
    { name: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
    { name: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38] },
    { name: 'RIFF', bytes: [0x52, 0x49, 0x46, 0x46] }
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
            showError('PNG/JPEG 以外の形式です。');
            setStatus('失敗');
            return;
        }

        state.format = format;
        dom.fileFormat.textContent = format;

        const result = format === 'PNG' ? parsePng(bytes) : parseJpeg(bytes);
        const signatures = scanSignatures(bytes);

        state.items = result.items;
        state.meta = result.meta;
        state.warnings = result.warnings;
        state.signatures = signatures;

        dom.itemCount.textContent = formatCount(result.items.length);
        dom.metaCount.textContent = formatCount(result.meta.length);
        dom.unknownCount.textContent = formatCount(result.unknownCount);
        dom.trailingBytes.textContent = formatBytes(result.trailingBytes);
        dom.signatureCount.textContent = formatCount(signatures.filter((hit) => hit.offset > 0).length);
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
        const note = hit.offset === 0 && hit.name === format ? 'file header' : 'embedded candidate';
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
