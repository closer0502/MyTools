(() => {
    'use strict';
    const ids = ['file', 'dropZone', 'fileInfo', 'columns', 'rows', 'gridInfo', 'error', 'mode', 'rowLabel', 'row', 'order', 'start', 'end', 'fps', 'repeat', 'stage', 'preview', 'placeholder', 'position', 'play', 'first', 'previous', 'next', 'scrub', 'zoom', 'background', 'smoothing', 'sheet', 'sheetEmpty'];
    const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
    const ctx = ui.preview.getContext('2d');
    const sheetCtx = ui.sheet.getContext('2d');
    let bitmap = null, sequence = [], index = 0, playing = false, lastTime = 0, raf = 0, loadId = 0;
    let columns = 1, rows = 1, width = 0, height = 0, valid = false;
    const integer = (input, min, max) => Number.isInteger(Number(input.value)) && Number(input.value) >= min && Number(input.value) <= max;
    function pause() {
        playing = false;
        cancelAnimationFrame(raf);
        ui.play.textContent = '再生';
    }
    function error(message) {
        ui.error.textContent = message;
        ui.error.hidden = !message;
    }
    function configure(resetRange = false) {
        valid = false;
        sequence = [];
        error('');
        ui.rowLabel.hidden = ui.mode.value !== 'row';
        ui.order.disabled = ui.mode.value === 'row';
        let message = '';
        if (!integer(ui.columns, 1, 512) || !integer(ui.rows, 1, 512)) message = '分割数は1〜512の整数で指定してください。';
        else if (bitmap) {
            columns = Number(ui.columns.value);
            rows = Number(ui.rows.value);
            if (columns * rows > 16384) message = '総コマ数は16,384以下にしてください。';
            else if (bitmap.width % columns || bitmap.height % rows) message = `画像 ${bitmap.width} × ${bitmap.height}px を割り切れる分割数にしてください。`;
            else {
                width = bitmap.width / columns;
                height = bitmap.height / rows;
                ui.gridInfo.textContent = `1コマ ${width} × ${height}px · 全${columns * rows}コマ`;
                ui.row.max = rows;
                const count = ui.mode.value === 'row' ? columns : columns * rows;
                ui.start.max = ui.end.max = count;
                if (resetRange) { ui.start.value = 1; ui.end.value = count; index = 0; }
                if (ui.mode.value === 'row' && !integer(ui.row, 1, rows)) message = `行は1〜${rows}で指定してください。`;
                else if (!integer(ui.start, 1, count) || !integer(ui.end, 1, count) || Number(ui.start.value) > Number(ui.end.value)) message = `開始・終了は1〜${count}で、開始 ≤ 終了にしてください。`;
                else if (!integer(ui.fps, 1, 60)) message = 'FPSは1〜60の整数で指定してください。';
                else {
                    for (let n = Number(ui.start.value) - 1; n < Number(ui.end.value); n++) {
                        const col = ui.mode.value === 'row' || ui.order.value === 'horizontal' ? n % columns : Math.floor(n / rows);
                        const row = ui.mode.value === 'row' ? Number(ui.row.value) - 1 : ui.order.value === 'horizontal' ? Math.floor(n / columns) : n % rows;
                        sequence.push({ col, row, number: n + 1 });
                    }
                    valid = true;
                    index = Math.min(index, sequence.length - 1);
                }
            }
        }
        if (!valid) ui.gridInfo.textContent = '等間隔・余白なしの画像に対応します。';
        error(message);
        for (const id of ['play', 'first', 'previous', 'next', 'scrub']) ui[id].disabled = !valid;
        ui.preview.hidden = !valid;
        ui.placeholder.hidden = valid;
        ui.placeholder.textContent = bitmap ? '分割・再生設定を確認してください' : 'ここにアニメーションを表示します';
        ui.scrub.max = Math.max(1, sequence.length);
        if (valid) { lastTime = performance.now(); draw(); }
        else { pause(); ui.position.textContent = bitmap ? '設定を確認' : '未読み込み'; drawSheet(); }
    }
    function resizePreview() {
        if (!valid) return;
        const scale = ui.zoom.value === 'fit' ? Math.min((ui.stage.clientWidth - 24) / width, (ui.stage.clientHeight - 24) / height) : Number(ui.zoom.value);
        ui.preview.style.width = `${Math.max(1, width * scale)}px`;
        ui.preview.style.height = `${Math.max(1, height * scale)}px`;
        ui.preview.style.imageRendering = ui.smoothing.checked ? 'auto' : 'pixelated';
    }
    function draw() {
        if (!valid) return;
        const cell = sequence[index];
        if (ui.preview.width !== width) ui.preview.width = width;
        if (ui.preview.height !== height) ui.preview.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = ui.smoothing.checked;
        ctx.drawImage(bitmap, cell.col * width, cell.row * height, width, height, 0, 0, width, height);
        ui.position.textContent = `コマ ${index + 1} / ${sequence.length} · 行${cell.row + 1}・列${cell.col + 1}`;
        ui.scrub.value = index + 1;
        resizePreview();
        drawSheet();
    }
    function drawSheet() {
        ui.sheet.hidden = !bitmap;
        ui.sheetEmpty.hidden = !!bitmap;
        if (!bitmap) return;
        const displayScale = Math.min(Math.min(ui.sheet.parentElement.clientWidth, 320) / bitmap.width, 220 / bitmap.height);
        ui.sheet.style.width = `${bitmap.width * displayScale}px`;
        ui.sheet.style.height = `${bitmap.height * displayScale}px`;
        const scale = displayScale * Math.min(devicePixelRatio || 1, 2);
        const sw = Math.max(1, Math.round(bitmap.width * scale)), sh = Math.max(1, Math.round(bitmap.height * scale));
        if (ui.sheet.width !== sw) ui.sheet.width = sw;
        if (ui.sheet.height !== sh) ui.sheet.height = sh;
        sheetCtx.clearRect(0, 0, sw, sh);
        sheetCtx.imageSmoothingEnabled = ui.smoothing.checked;
        sheetCtx.drawImage(bitmap, 0, 0, sw, sh);
        if (!valid) return;
        const cw = sw / columns, ch = sh / rows;
        sheetCtx.fillStyle = 'rgba(56,189,248,.15)';
        for (const cell of sequence) sheetCtx.fillRect(cell.col * cw, cell.row * ch, cw, ch);
        sheetCtx.strokeStyle = 'rgba(255,255,255,.55)';
        sheetCtx.lineWidth = 1;
        sheetCtx.beginPath();
        for (let c = 0; c <= columns; c++) { sheetCtx.moveTo(c * cw, 0); sheetCtx.lineTo(c * cw, sh); }
        for (let r = 0; r <= rows; r++) { sheetCtx.moveTo(0, r * ch); sheetCtx.lineTo(sw, r * ch); }
        sheetCtx.stroke();
        if (cw >= 26 && ch >= 22) {
            sheetCtx.font = '12px sans-serif';
            for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
                const n = ui.mode.value === 'row' ? c + 1 : ui.order.value === 'horizontal' ? r * columns + c + 1 : c * rows + r + 1;
                const x = c * cw + 3, y = r * ch + 3;
                sheetCtx.fillStyle = '#0b1220cc'; sheetCtx.fillRect(x, y, sheetCtx.measureText(String(n)).width + 6, 17);
                sheetCtx.fillStyle = 'white'; sheetCtx.fillText(String(n), x + 3, y + 13);
            }
        }
        const current = sequence[index];
        sheetCtx.strokeStyle = '#38bdf8'; sheetCtx.lineWidth = 3;
        sheetCtx.strokeRect(current.col * cw + 1.5, current.row * ch + 1.5, Math.max(0, cw - 3), Math.max(0, ch - 3));
    }
    function tick(now) {
        if (!playing) return;
        const duration = 1000 / Number(ui.fps.value);
        const steps = Math.floor((now - lastTime) / duration);
        if (steps > 0) {
            lastTime += steps * duration;
            if (ui.repeat.value === 'once' && index + steps >= sequence.length) { index = sequence.length - 1; pause(); draw(); return; }
            index = (index + steps) % sequence.length;
            draw();
        }
        raf = requestAnimationFrame(tick);
    }
    function toggle() {
        if (!valid) return;
        if (playing) { pause(); return; }
        if (ui.repeat.value === 'once' && index === sequence.length - 1) index = 0;
        playing = true; ui.play.textContent = '一時停止'; lastTime = performance.now(); draw();
        raf = requestAnimationFrame(tick);
    }
    function seek(next) { if (!valid) return; index = Math.max(0, Math.min(sequence.length - 1, next)); lastTime = performance.now(); draw(); }
    async function load(file) {
        if (!file) return;
        const ticket = ++loadId;
        pause();
        if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) { error('PNG・WebP・JPEGの静止画を選択してください。'); return; }
        try {
            // ImageBitmap provides a fixed frame even if an animated image is supplied.
            const nextBitmap = await createImageBitmap(file);
            if (ticket !== loadId) { nextBitmap.close(); return; }
            if (nextBitmap.width > 16384 || nextBitmap.height > 16384 || nextBitmap.width * nextBitmap.height > 67108864) {
                nextBitmap.close(); throw new Error('画像は各辺16,384px以下、合計約6,700万画素以下にしてください。');
            }
            if (bitmap) bitmap.close();
            bitmap = nextBitmap;
            ui.fileInfo.textContent = `${file.name} · ${bitmap.width} × ${bitmap.height}px`;
            ui.row.value = 1;
            configure(true);
        } catch (e) { if (ticket === loadId) error(e.message.startsWith('画像は') ? e.message : '画像を読み込めませんでした。別の画像を選択してください。'); }
    }
    ui.file.addEventListener('change', () => { load(ui.file.files[0]); ui.file.value = ''; });
    for (const type of ['dragenter', 'dragover']) ui.dropZone.addEventListener(type, e => { e.preventDefault(); ui.dropZone.classList.add('dragging'); });
    ui.dropZone.addEventListener('dragleave', () => ui.dropZone.classList.remove('dragging'));
    ui.dropZone.addEventListener('drop', e => { e.preventDefault(); ui.dropZone.classList.remove('dragging'); load(e.dataTransfer.files[0]); });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => e.preventDefault());
    for (const id of ['columns', 'rows', 'mode', 'order']) ui[id].addEventListener('input', () => configure(true));
    for (const id of ['row', 'start', 'end', 'fps']) ui[id].addEventListener('input', () => configure());
    ui.play.addEventListener('click', toggle);
    ui.first.addEventListener('click', () => seek(0));
    ui.previous.addEventListener('click', () => seek(index - 1));
    ui.next.addEventListener('click', () => seek(index + 1));
    ui.scrub.addEventListener('input', () => seek(Number(ui.scrub.value) - 1));
    ui.zoom.addEventListener('change', resizePreview);
    ui.smoothing.addEventListener('change', draw);
    ui.background.addEventListener('change', () => { ui.stage.className = `stage ${ui.background.value}`; });
    ui.sheet.addEventListener('click', e => {
        if (!valid) return;
        const rect = ui.sheet.getBoundingClientRect();
        const col = Math.min(columns - 1, Math.floor((e.clientX - rect.left) / rect.width * columns));
        const row = Math.min(rows - 1, Math.floor((e.clientY - rect.top) / rect.height * rows));
        if (ui.mode.value === 'row' && Number(ui.row.value) !== row + 1) { ui.row.value = row + 1; configure(true); }
        const found = sequence.findIndex(cell => cell.col === col && cell.row === row);
        if (found >= 0) { error(''); seek(found); }
        else { error('選択したコマは再生範囲外です。開始・終了コマを広げてください。'); }
    });
    document.addEventListener('keydown', e => {
        if (!valid || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,select,textarea,button,a,[contenteditable]')) return;
        if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggle(); }
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); seek(index + (e.code === 'ArrowLeft' ? -1 : 1)); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    new ResizeObserver(resizePreview).observe(ui.stage);
    new ResizeObserver(drawSheet).observe(ui.sheet.parentElement);
    configure();
})();
