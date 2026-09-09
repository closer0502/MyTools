'use strict';
const $ = id => document.getElementById(id);
const core = window.PixelCore;
let sourceImage = null, sourceCanvas = null, resultImage = null, filename = 'pixel-art', loadId = 0;
let timer;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function invalidate() {
    resultImage = null;
    $('save').disabled = $('saveScaled').disabled = true;
    $('resultInfo').textContent = '設定が変更されました。変換を適用してください。';
}
function options() {
    if (!$('settings').reportValidity()) throw new Error('数値の範囲を確認してください。');
    const value = { width: Number($('width').value), offsetX: Number($('offsetX').value), offsetY: Number($('offsetY').value), sampling: $('sampling').value, alpha: Number($('alpha').value) };
    if (![value.width, value.offsetX, value.offsetY, value.alpha].every(Number.isFinite)) throw new Error('有効な数値を入力してください。');
    return value;
}
function drawSource() {
    if (!sourceCanvas) return;
    const canvas = $('source'), scale = Math.min(1, 1000 / sourceCanvas.width, 650 / sourceCanvas.height);
    canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    const width = Number($('width').value);
    if (!Number.isInteger(width) || width < 1 || width > 512) return;
    const g = core.geometry(sourceImage, width);
    $('dimensions').textContent = `出力 ${g.width} × ${g.height}px / 1マス = 元画像の ${g.cell.toFixed(2)}px`;
    const sx = canvas.width / sourceImage.width, sy = canvas.height / sourceImage.height;
    const ox = Number($('offsetX').value), oy = Number($('offsetY').value);
    if (!$('grid').checked || !Number.isFinite(ox) || !Number.isFinite(oy) || g.cell * sx < 4 || g.cell * sy < 4) return;
    ctx.beginPath();
    for (let x = 0; x <= g.width; x++) { const p = (ox + x * g.cell) * sx; ctx.moveTo(p, oy * sy); ctx.lineTo(p, (oy + g.height * g.cell) * sy); }
    for (let y = 0; y <= g.height; y++) { const p = (oy + y * g.cell) * sy; ctx.moveTo(ox * sx, p); ctx.lineTo((ox + g.width * g.cell) * sx, p); }
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(56,211,238,.7)'; ctx.lineWidth = .7; ctx.stroke();
}
function zoom() {
    const canvas = $('result'), n = Number($('zoom').value);
    canvas.style.width = `${canvas.width * n}px`;
    canvas.style.height = `${canvas.height * n}px`;
}
function convert() {
    if (!sourceImage) return;
    clearTimeout(timer);
    invalidate();
    try {
        const config = options(), fixed = core.parsePalette($('fixed').value);
        const result = core.quantize(core.sample(sourceImage, config), Number($('colors').value), fixed, $('paletteMode').value === 'custom');
        const canvas = $('result');
        canvas.width = result.width; canvas.height = result.height;
        canvas.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
        resultImage = result;
        const colors = new Set();
        let transparent = false;
        for (let i = 0; i < result.data.length; i += 4) {
            if (result.data[i + 3]) colors.add(core.hex(Array.from(result.data.slice(i, i + 3))));
            else transparent = true;
        }
        $('resultInfo').textContent = `${result.width} × ${result.height}px · ${colors.size}色${transparent ? ' + 透明' : ''}`;
        $('swatches').replaceChildren();
        [...colors].slice(0, 256).forEach(color => {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'swatch'; button.style.backgroundColor = color;
            button.title = `${color} を固定色に追加`; button.setAttribute('aria-label', button.title);
            button.addEventListener('click', () => {
                try {
                    const fixed = core.parsePalette($('fixed').value).map(core.hex);
                    if (!fixed.includes(color)) fixed.push(color);
                    $('fixed').value = fixed.join(', '); invalidate();
                    status(`${color} を固定色に追加しました。変換を適用してください。`);
                } catch (error) { status(error.message, true); }
            });
            $('swatches').append(button);
        });
        if (colors.size > 256) {
            const note = document.createElement('span'); note.className = 'hint'; note.textContent = '先頭256色を表示しています。'; $('swatches').append(note);
        }
        zoom(); drawSource();
        $('save').disabled = $('saveScaled').disabled = false;
        status('変換しました。原寸や拡大表示で輪郭を確認して、PNGを保存できます。');
    } catch (error) { status(error.message, true); }
}
function setSource(canvas, name) {
    sourceCanvas = canvas;
    sourceImage = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    filename = name.replace(/\.[^.]+$/, '') || 'pixel-art';
    $('sourceInfo').textContent = `${name} · ${canvas.width} × ${canvas.height}px`;
    $('controls').disabled = false;
    $('offsetX').value = $('offsetY').value = '0';
    drawSource(); convert();
}
async function loadFile(file) {
    if (!file) return;
    const id = ++loadId;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { status('PNG / JPEG / WebP画像を選択してください。', true); return; }
    if (file.size > 20 * 1024 * 1024) { status('20MB以下の画像を選択してください。', true); return; }
    const url = URL.createObjectURL(file);
    status('画像を読み込んでいます…');
    try {
        const image = new Image(); image.src = url; await image.decode();
        if (id !== loadId) return;
        if (image.naturalWidth * image.naturalHeight > 16000000 || image.naturalWidth > 16384 || image.naturalHeight > 16384) throw new Error('16メガピクセル以下、各辺16,384px以下の画像を選択してください。');
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        setSource(canvas, file.name);
    } catch (error) { if (id === loadId) status(error.message.startsWith('16') ? error.message : '画像を読み込めませんでした。別の画像を試してください。', true); }
    finally { URL.revokeObjectURL(url); }
}
function save(scale) {
    if (!resultImage) return;
    const canvas = document.createElement('canvas');
    canvas.width = resultImage.width * scale; canvas.height = resultImage.height * scale;
    if (canvas.width * canvas.height > 16777216 || canvas.width > 16384 || canvas.height > 16384) { status('拡大後の画像が大きすぎます。倍率を下げてください。', true); return; }
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage($('result'), 0, 0, canvas.width, canvas.height);
    const name = `${filename}-${resultImage.width}x${resultImage.height}-${scale}x.png`;
    canvas.toBlob(blob => {
        if (!blob) { status('PNGの作成に失敗しました。', true); return; }
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        status(`${name} を書き出しました。`);
    }, 'image/png');
}
$('file').addEventListener('change', event => { loadFile(event.target.files[0]); event.target.value = ''; });
for (const name of ['dragenter', 'dragover']) $('dropZone').addEventListener(name, event => { event.preventDefault(); $('dropZone').classList.add('dragover'); });
for (const name of ['dragleave', 'drop']) $('dropZone').addEventListener(name, event => { event.preventDefault(); $('dropZone').classList.remove('dragover'); });
$('dropZone').addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
$('settings').addEventListener('submit', event => { event.preventDefault(); convert(); });
$('settings').addEventListener('input', event => {
    if (event.target.id === 'exportScale') return;
    if (!sourceImage) return;
    invalidate(); clearTimeout(timer); timer = setTimeout(drawSource, 60);
    status('設定を変更しました。「変換を適用」で結果を更新してください。');
});
$('grid').addEventListener('change', drawSource);
$('zoom').addEventListener('change', zoom);
$('save').addEventListener('click', () => save(1));
$('saveScaled').addEventListener('click', () => save(Number($('exportScale').value)));
$('estimate').addEventListener('click', () => {
    const estimated = core.estimate(sourceImage);
    if (!estimated) { status('規則的な格子を検出できませんでした。横幅と位置を手動で指定してください。'); return; }
    $('width').value = estimated.width; $('offsetX').value = estimated.offsetX; $('offsetY').value = estimated.offsetY;
    invalidate(); drawSource();
    status(`推定横幅は${estimated.width}pxです。元画像の格子を確認して、変換を適用してください。`);
});
$('demo').addEventListener('click', () => {
    ++loadId;
    const tiny = document.createElement('canvas'); tiny.width = tiny.height = 32;
    const ctx = tiny.getContext('2d');
    ctx.fillStyle = '#172038'; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#385775'; ctx.fillRect(5, 26, 22, 2);
    ctx.fillStyle = '#42b8a3'; ctx.fillRect(8, 10, 16, 15); ctx.fillRect(10, 6, 12, 19);
    ctx.fillStyle = '#83e3bb'; ctx.fillRect(10, 7, 4, 16); ctx.fillRect(7, 14, 3, 7);
    ctx.fillStyle = '#172038'; ctx.fillRect(12, 12, 2, 3); ctx.fillRect(19, 12, 2, 3); ctx.fillRect(14, 19, 5, 1);
    ctx.fillStyle = '#fff0b5'; ctx.fillRect(12, 12, 1, 1); ctx.fillRect(19, 12, 1, 1); ctx.fillRect(24, 5, 3, 1); ctx.fillRect(25, 4, 1, 3);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const full = canvas.getContext('2d'); full.imageSmoothingEnabled = false; full.drawImage(tiny, 0, 0, 256, 256);
    $('width').value = '32';
    setSource(canvas, 'sample.png');
});
