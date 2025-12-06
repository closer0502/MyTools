const textInput = document.getElementById('textInput');
const encodingSelect = document.getElementById('encodingSelect');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const clearBtn = document.getElementById('clearBtn');
const decodedOutput = document.getElementById('decodedOutput');
const hexOutput = document.getElementById('hexOutput');
const detectedEncoding = document.getElementById('detectedEncoding');
const confidenceEl = document.getElementById('confidence');
const bomInfo = document.getElementById('bomInfo');
const byteLengthEl = document.getElementById('byteLength');
const lineCountEl = document.getElementById('lineCount');
const copyTextBtn = document.getElementById('copyText');
const downloadTextBtn = document.getElementById('downloadText');
const copyHexBtn = document.getElementById('copyHex');
const downloadHexBtn = document.getElementById('downloadHex');
const newlineRadios = document.querySelectorAll('input[name="newline"]');
const decodedEncodingLabel = document.getElementById('decodedEncodingLabel');
const decodedNewlineLabel = document.getElementById('decodedNewlineLabel');
const fileButton = document.getElementById('fileButton');

let lastArrayBuffer = new ArrayBuffer(0);
let lastEncoding = 'auto';
let lastHexFull = '';
let lastText = '';
let lastFileName = 'output';
let skipNextTextInput = false; // avoid re-decoding when we programmatically set textarea

function detectEncoding(buffer) {
    if (!buffer || buffer.byteLength === 0) return { name: '-', confidence: 0 };
    const view = new Uint8Array(buffer);
    // Limit the sampled bytes to keep detection fast and avoid huge string allocations
    const sampleString = toBinaryString(view.subarray(0, 100000));
    const bom = detectBOM(view);
    const result = jschardet.detect(sampleString);
    // Normalise name to match encoding-japanese labels
    const name = normalizeEncodingName(result.encoding);
    return {
        name: name || '-',
        display: bom ? `${name || '-'} (BOM)` : name || '-',
        confidence: Math.round((result.confidence || 0) * 100),
        bom
    };
}

function toBinaryString(uint8) {
    // Use TextDecoder if available for performance; fall back to manual join
    try {
        return new TextDecoder('latin1').decode(uint8);
    } catch (_) {
        let out = '';
        for (let i = 0; i < uint8.length; i++) out += String.fromCharCode(uint8[i]);
        return out;
    }
}

function detectBOM(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return { label: 'UTF-8 (BOM)', length: 3 };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        return { label: 'UTF-16BE (BOM)', length: 2 };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        return { label: 'UTF-16LE (BOM)', length: 2 };
    }
    return null;
}

function normalizeEncodingName(name = '') {
    const upper = name.toUpperCase();
    if (upper === 'SHIFT_JIS' || upper === 'SHIFT-JIS' || upper === 'SJIS') return 'Shift_JIS';
    if (upper === 'EUC-JP' || upper === 'EUCJP') return 'EUC-JP';
    if (upper === 'ISO-2022-JP') return 'ISO-2022-JP';
    if (upper === 'WINDOWS-31J' || upper === 'CP932' || upper === 'MS932') return 'Windows-31J';
    if (upper.startsWith('UTF-8')) return 'UTF-8';
    return name || 'unknown';
}

function bufferToHexPreview(buffer, limit = 65536) {
    const bytes = new Uint8Array(buffer.slice(0, limit));
    const rows = [];
    for (let i = 0; i < bytes.length; i += 16) {
        const chunk = bytes.slice(i, i + 16);
        const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const ascii = Array.from(chunk).map(b => {
            const c = b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
            return c;
        }).join('');
        rows.push(i.toString(16).padStart(8, '0') + '  ' + hex.padEnd(16 * 3 - 1, ' ') + '  ' + ascii);
    }
    return rows.join('\n');
}

function convertNewlines(text, mode) {
    if (mode === 'lf') return text.replace(/\r\n|\r/g, '\n');
    if (mode === 'crlf') return text.replace(/(?<!\r)\n/g, '\r\n');
    return text;
}

function decodeBuffer(buffer, encoding, bom) {
    let targetEncoding = encoding;
    if (encoding === 'auto') {
        const detect = detectEncoding(buffer);
        targetEncoding = detect.name;
        updateMeta(detect, buffer, detect.bom || bom);
    }

    const bytes = new Uint8Array(buffer);
    let text = '';
    try {
        const libEncoding = mapForEncodingJs(targetEncoding);
        if (libEncoding === 'UTF8' && bom?.length) {
            text = Encoding.codeToString(bytes.slice(bom.length));
        } else {
            text = Encoding.convert(bytes, { to: 'UNICODE', from: libEncoding, type: 'string' });
        }
    } catch (err) {
        text = `デコードに失敗しました: ${err.message || err}`;
    }
    return text;
}

function mapForEncodingJs(name = '') {
    const cleaned = name.replace(/\s*\(.*?\)/g, ''); // drop "(BOM)"などの表記
    const upper = cleaned.toUpperCase();
    if (upper === 'SHIFT_JIS' || upper === 'SHIFT-JIS' || upper === 'SJIS' || upper === 'WINDOWS-31J' || upper === 'CP932' || upper === 'MS932') return 'SJIS';
    if (upper === 'EUC-JP' || upper === 'EUCJP') return 'EUCJP';
    if (upper === 'ISO-2022-JP') return 'ISO2022JP';
    if (upper === 'UTF-8' || upper === 'UTF8') return 'UTF8';
    return name;
}

function detectNewlineStyle(text = '') {
    if (!text) return '-';
    const hasCRLF = /\r\n/.test(text);
    const hasCR = /\r(?!\n)/.test(text);
    const hasLF = /\n/.test(text);
    if (hasCRLF) return 'CRLF (\\r\\n)';
    if (hasCR) return 'CR (\\r)';
    if (hasLF) return 'LF (\\n)';
    return 'なし';
}

function newlineModeLabel(mode, originalText) {
    if (mode === 'lf') return 'LF (\\n)';
    if (mode === 'crlf') return 'CRLF (\\r\\n)';
    // 保持の場合は実際に検出した改行種別を表示
    return detectNewlineStyle(originalText);
}

function updateMeta(info, buffer, bom) {
    detectedEncoding.textContent = info.display || info.name;
    confidenceEl.textContent = info.confidence ? `${info.confidence}%` : '-';
    byteLengthEl.textContent = buffer?.byteLength || 0;
    bomInfo.textContent = bom ? bom.label : 'なし';
    const text = lastText || '';
    lineCountEl.textContent = text ? text.split(/\n/).length : 0;
}

function handleBuffer(buffer, name = 'output', mirrorToInput = true) {
    lastArrayBuffer = buffer;
    lastFileName = name.replace(/\.[^.]+$/, '') || 'output';
    const selected = encodingSelect.value;
    const detected = detectEncoding(buffer);
    const bom = detected.bom;
    lastEncoding = selected === 'auto' ? detected.name : selected;

    const decoded = decodeBuffer(buffer, selected, bom);
    const newlineMode = document.querySelector('input[name="newline"]:checked').value;
    const normalized = convertNewlines(decoded, newlineMode);
    lastText = normalized;
    decodedOutput.textContent = normalized;
    decodedEncodingLabel.textContent = `エンコード: ${selected === 'auto' ? (detected.display || detected.name) : selected}`;
    decodedNewlineLabel.textContent = `改行: ${newlineModeLabel(newlineMode, decoded)}`;

    if (mirrorToInput) {
        // Mirror decoded text into the textarea without triggering a new decode
        skipNextTextInput = true;
        textInput.value = normalized;
    }

    updateMeta(detected, buffer, bom);
    const hex = bufferToHexPreview(buffer);
    lastHexFull = hex;
    hexOutput.textContent = hex || '(データなし)';
}

function handleTextInput(text) {
    // For pasted text, we assume UTF-8 input because raw bytes are unavailable.
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    handleBuffer(buffer, 'pasted', false);
}

function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => handleBuffer(reader.result, file.name, true);
    reader.onerror = () => alert('ファイル読み込みに失敗しました');
    reader.readAsArrayBuffer(file);
}

textInput.addEventListener('input', (e) => {
    if (e.isComposing) return;
    if (skipNextTextInput) {
        skipNextTextInput = false;
        return;
    }
    handleTextInput(textInput.value);
});

// IME確定（Enter含む）時に確実にデコードを走らせる
textInput.addEventListener('compositionend', () => {
    if (skipNextTextInput) {
        skipNextTextInput = false;
        return;
    }
    handleTextInput(textInput.value);
});

encodingSelect.addEventListener('change', () => {
    if (lastArrayBuffer.byteLength) {
        handleBuffer(lastArrayBuffer, lastFileName, true);
    }
});

newlineRadios.forEach(radio => radio.addEventListener('change', () => {
    if (lastArrayBuffer.byteLength) {
        handleBuffer(lastArrayBuffer, lastFileName, true);
    }
}));

fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
});

fileButton.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
});

clearBtn.addEventListener('click', () => {
    textInput.value = '';
    decodedOutput.textContent = '';
    hexOutput.textContent = '';
    detectedEncoding.textContent = '-';
    confidenceEl.textContent = '-';
    bomInfo.textContent = '-';
    byteLengthEl.textContent = '0';
    lineCountEl.textContent = '0';
    decodedEncodingLabel.textContent = 'エンコード: -';
    decodedNewlineLabel.textContent = '改行: -';
    lastArrayBuffer = new ArrayBuffer(0);
    lastHexFull = '';
    lastText = '';
});

copyTextBtn.addEventListener('click', async () => {
    if (!lastText) return;
    await navigator.clipboard.writeText(lastText);
    copyTextBtn.textContent = 'コピー済み';
    setTimeout(() => (copyTextBtn.textContent = 'コピー'), 1200);
});

downloadTextBtn.addEventListener('click', () => {
    const blob = new Blob([lastText || ''], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${lastFileName || 'output'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
});

copyHexBtn.addEventListener('click', async () => {
    if (!lastHexFull) return;
    await navigator.clipboard.writeText(lastHexFull);
    copyHexBtn.textContent = 'コピー済み';
    setTimeout(() => (copyHexBtn.textContent = 'Hexコピー'), 1200);
});

downloadHexBtn.addEventListener('click', () => {
    const blob = new Blob([lastHexFull || ''], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${lastFileName || 'output'}-hex.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
});

// Initialize with empty state
handleTextInput('');
