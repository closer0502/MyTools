const dropZone = document.getElementById('dropZone');
const fileSelect = document.getElementById('fileSelect');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const totalSize = document.getElementById('totalSize');
const firstDims = document.getElementById('firstDims');
const pageSizeInfo = document.getElementById('pageSizeInfo');
const sizeWarning = document.getElementById('sizeWarning');
const previewImage = document.getElementById('previewImage');
const previewMeta = document.getElementById('previewMeta');
const sortNameBtn = document.getElementById('sortName');
const reverseOrderBtn = document.getElementById('reverseOrder');
const pageSizeSelect = document.getElementById('pageSize');
const orientationSelect = document.getElementById('orientation');
const orientationRow = document.getElementById('orientationRow');
const marginInput = document.getElementById('margin');
const fitModeSelect = document.getElementById('fitMode');
const dpiPreset = document.getElementById('dpiPreset');
const dpiCustom = document.getElementById('dpiCustom');
const imageFormatSelect = document.getElementById('imageFormat');
const qualityInput = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const qualityRow = document.getElementById('qualityRow');
const bgColorInput = document.getElementById('bgColor');
const bgColorValue = document.getElementById('bgColorValue');
const bgRow = document.getElementById('bgRow');
const compressionSelect = document.getElementById('compression');
const fileNameInput = document.getElementById('fileName');
const statusEl = document.getElementById('status');
const buildBtn = document.getElementById('buildPdf');
const resetBtn = document.getElementById('resetAll');
const errorBanner = document.getElementById('errorBanner');

const PAGE_SIZES = {
    a4: { width: 210, height: 297 },
    b5: { width: 176, height: 250 },
    letter: { width: 216, height: 279 }
};

const state = {
    items: [],
    busy: false
};

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) {
        return '-';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function pxToMm(px, dpi) {
    return (px * 25.4) / dpi;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function setStatus(message) {
    statusEl.textContent = message;
}

function setError(message) {
    if (!message) {
        errorBanner.textContent = '';
        errorBanner.classList.add('hidden');
        return;
    }
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
}

function getDpi() {
    if (dpiPreset.value === 'custom') {
        const customValue = Number(dpiCustom.value);
        if (!Number.isFinite(customValue) || customValue <= 0) {
            return 300;
        }
        return clamp(customValue, 72, 600);
    }
    const presetValue = Number(dpiPreset.value);
    if (!Number.isFinite(presetValue) || presetValue <= 0) {
        return 300;
    }
    return clamp(presetValue, 72, 600);
}

function updateDpiControls() {
    const isCustom = dpiPreset.value === 'custom';
    dpiCustom.disabled = !isCustom;
    if (!isCustom) {
        dpiCustom.value = dpiPreset.value;
    }
}

function updateQualityLabel() {
    qualityValue.textContent = `${qualityInput.value}%`;
}

function updateBgColorLabel() {
    bgColorValue.textContent = bgColorInput.value.toLowerCase();
}

function updateFormatControls() {
    const isJpeg = imageFormatSelect.value === 'image/jpeg';
    qualityInput.disabled = !isJpeg;
    bgColorInput.disabled = !isJpeg;
    qualityRow.classList.toggle('is-disabled', !isJpeg);
    bgRow.classList.toggle('is-disabled', !isJpeg);
}

function updateOrientationControl() {
    const isAuto = pageSizeSelect.value === 'auto';
    orientationSelect.disabled = isAuto;
    orientationRow.classList.toggle('is-disabled', isAuto);
}

function computePageSizeMm() {
    if (state.items.length === 0) {
        return null;
    }
    const dpi = getDpi();
    const mode = pageSizeSelect.value;
    if (mode === 'auto') {
        const first = state.items[0];
        return {
            width: pxToMm(first.width, dpi),
            height: pxToMm(first.height, dpi),
            label: 'auto'
        };
    }

    const base = PAGE_SIZES[mode];
    let width = base.width;
    let height = base.height;
    if (orientationSelect.value === 'landscape') {
        [width, height] = [height, width];
    }
    return { width, height, label: mode };
}

function updateSummary() {
    fileCount.textContent = state.items.length.toString();
    const total = state.items.reduce((sum, item) => sum + item.size, 0);
    totalSize.textContent = formatBytes(total);

    if (state.items.length === 0) {
        firstDims.textContent = '-';
        previewImage.removeAttribute('src');
        previewMeta.textContent = '-';
        pageSizeInfo.textContent = '-';
        sizeWarning.classList.add('hidden');
        return;
    }

    const first = state.items[0];
    firstDims.textContent = `${first.width} x ${first.height} px`;
    previewImage.src = first.url;
    previewMeta.textContent = first.name;

    const page = computePageSizeMm();
    if (page) {
        pageSizeInfo.textContent = `${numberFormatter.format(page.width)} x ${numberFormatter.format(page.height)} mm`;
    }

    const mismatch = state.items.some((item) => item.width !== first.width || item.height !== first.height);
    if (mismatch) {
        sizeWarning.textContent = 'サイズが混在しています。自動サイズは先頭画像に合わせて計算します。';
        sizeWarning.classList.remove('hidden');
    } else {
        sizeWarning.classList.add('hidden');
    }
}

function updateList() {
    fileList.innerHTML = '';
    if (state.items.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'file-item';
        empty.textContent = '画像がまだありません。';
        fileList.appendChild(empty);
        updateSummary();
        return;
    }

    state.items.forEach((item, index) => {
        const row = document.createElement('li');
        row.className = 'file-item';

        const thumb = document.createElement('img');
        thumb.className = 'thumb';
        thumb.src = item.url;
        thumb.alt = item.name;

        const body = document.createElement('div');
        body.className = 'file-body';

        const name = document.createElement('div');
        name.className = 'file-name';
        name.textContent = `${index + 1}. ${item.name}`;

        const meta = document.createElement('div');
        meta.className = 'file-meta';
        meta.textContent = `${item.width} x ${item.height} px · ${formatBytes(item.size)}`;

        body.append(name, meta);

        const actions = document.createElement('div');
        actions.className = 'file-actions';

        const upBtn = document.createElement('button');
        upBtn.className = 'icon-button';
        upBtn.type = 'button';
        upBtn.textContent = '上へ';
        upBtn.disabled = index === 0;
        upBtn.addEventListener('click', () => moveItem(index, -1));

        const downBtn = document.createElement('button');
        downBtn.className = 'icon-button';
        downBtn.type = 'button';
        downBtn.textContent = '下へ';
        downBtn.disabled = index === state.items.length - 1;
        downBtn.addEventListener('click', () => moveItem(index, 1));

        const removeBtn = document.createElement('button');
        removeBtn.className = 'icon-button';
        removeBtn.type = 'button';
        removeBtn.textContent = '削除';
        removeBtn.addEventListener('click', () => removeItem(index));

        actions.append(upBtn, downBtn, removeBtn);
        row.append(thumb, body, actions);
        fileList.appendChild(row);
    });

    updateSummary();
}

function moveItem(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= state.items.length) {
        return;
    }
    const swapped = state.items[index];
    state.items[index] = state.items[target];
    state.items[target] = swapped;
    updateList();
}

function removeItem(index) {
    const [removed] = state.items.splice(index, 1);
    if (removed) {
        URL.revokeObjectURL(removed.url);
    }
    updateList();
}

function clearAll() {
    state.items.forEach((item) => URL.revokeObjectURL(item.url));
    state.items = [];
    fileInput.value = '';
    setError('');
    setStatus('画像を読み込んでください。');
    updateList();
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
        img.src = url;
    });
}

async function addFiles(fileListLike) {
    if (state.busy) {
        return;
    }
    setError('');
    const files = Array.from(fileListLike).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
        setError('画像ファイルが見つかりませんでした。');
        return;
    }

    state.busy = true;
    try {
        for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            setStatus(`読み込み中 (${i + 1}/${files.length})`);
            const url = URL.createObjectURL(file);
            try {
                const img = await loadImage(url);
                state.items.push({
                    file,
                    name: file.name,
                    size: file.size,
                    url,
                    width: img.naturalWidth,
                    height: img.naturalHeight
                });
            } catch (error) {
                URL.revokeObjectURL(url);
            }
        }
    } finally {
        state.busy = false;
        fileInput.value = '';
        updateList();
        setStatus('準備完了');
    }
}

function renderToDataUrl(image, format, quality, background) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (format === 'image/jpeg') {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0);
    if (format === 'image/png') {
        return canvas.toDataURL('image/png');
    }
    return canvas.toDataURL('image/jpeg', quality);
}

function getOutputFileName() {
    const raw = fileNameInput.value.trim();
    if (!raw) {
        return 'merged-images.pdf';
    }
    return raw.endsWith('.pdf') ? raw : `${raw}.pdf`;
}

async function buildPdf() {
    if (state.busy) {
        return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
        setError('PDFライブラリの読み込みに失敗しました。');
        return;
    }
    if (state.items.length === 0) {
        setError('画像を読み込んでからPDFを作成してください。');
        return;
    }

    setError('');
    state.busy = true;
    buildBtn.disabled = true;
    resetBtn.disabled = true;

    try {
        const dpi = getDpi();
        const margin = Math.max(0, Number(marginInput.value) || 0);
        const format = imageFormatSelect.value;
        const quality = clamp(Number(qualityInput.value) / 100, 0.1, 1);
        const background = bgColorInput.value;
        const compression = compressionSelect.value;
        const fitMode = fitModeSelect.value;

        const page = computePageSizeMm();
        if (!page) {
            throw new Error('ページサイズが計算できませんでした。');
        }

        const pdf = new window.jspdf.jsPDF({
            unit: 'mm',
            format: [page.width, page.height],
            compress: true
        });

        for (let i = 0; i < state.items.length; i += 1) {
            const item = state.items[i];
            setStatus(`PDFを生成中 (${i + 1}/${state.items.length})`);
            const img = await loadImage(item.url);
            const imgWidthMm = pxToMm(img.naturalWidth, dpi);
            const imgHeightMm = pxToMm(img.naturalHeight, dpi);

            const availableWidth = Math.max(page.width - margin * 2, 1);
            const availableHeight = Math.max(page.height - margin * 2, 1);
            const scale = fitMode === 'cover'
                ? Math.max(availableWidth / imgWidthMm, availableHeight / imgHeightMm)
                : Math.min(availableWidth / imgWidthMm, availableHeight / imgHeightMm);

            const drawWidth = imgWidthMm * scale;
            const drawHeight = imgHeightMm * scale;
            const x = (page.width - drawWidth) / 2;
            const y = (page.height - drawHeight) / 2;

            const dataUrl = renderToDataUrl(img, format, quality, background);
            const formatName = format === 'image/png' ? 'PNG' : 'JPEG';
            pdf.addImage(dataUrl, formatName, x, y, drawWidth, drawHeight, undefined, compression);
            if (i < state.items.length - 1) {
                pdf.addPage([page.width, page.height]);
            }
        }

        pdf.save(getOutputFileName());
        setStatus('PDFを保存しました。');
    } catch (error) {
        setError(error.message || 'PDFの生成に失敗しました。');
        setStatus('エラーが発生しました。');
    } finally {
        state.busy = false;
        buildBtn.disabled = false;
        resetBtn.disabled = false;
    }
}

fileSelect.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => addFiles(event.target.files));

['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add('is-dragover');
    });
});

['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove('is-dragover');
    });
});

dropZone.addEventListener('drop', (event) => {
    const { files } = event.dataTransfer;
    if (files && files.length > 0) {
        addFiles(files);
    }
});

dropZone.addEventListener('click', (event) => {
    if (event.target.closest('button')) {
        return;
    }
    fileInput.click();
});

sortNameBtn.addEventListener('click', () => {
    state.items.sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
    updateList();
});

reverseOrderBtn.addEventListener('click', () => {
    state.items.reverse();
    updateList();
});

pageSizeSelect.addEventListener('change', () => {
    updateOrientationControl();
    updateSummary();
});

orientationSelect.addEventListener('change', updateSummary);
marginInput.addEventListener('input', updateSummary);
dpiPreset.addEventListener('change', () => {
    updateDpiControls();
    updateSummary();
});
dpiCustom.addEventListener('input', updateSummary);
fitModeSelect.addEventListener('change', updateSummary);

imageFormatSelect.addEventListener('change', updateFormatControls);
qualityInput.addEventListener('input', updateQualityLabel);
bgColorInput.addEventListener('input', updateBgColorLabel);

buildBtn.addEventListener('click', buildPdf);
resetBtn.addEventListener('click', clearAll);

updateQualityLabel();
updateBgColorLabel();
updateFormatControls();
updateOrientationControl();
updateDpiControls();
updateList();
