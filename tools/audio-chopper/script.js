(() => {
    'use strict';
    const C = window.ChopCore;
    const ids = ['file', 'dropZone', 'fileInfo', 'status', 'overview', 'overviewWindow', 'fit', 'detail', 'wave', 'markerLane', 'markers', 'playhead', 'emptyWave', 'viewInfo', 'play', 'stop', 'loop', 'selectionInfo', 'deleteMarker', 'regions', 'count', 'selectAll', 'selectNone', 'fade', 'outputRate', 'outputBits', 'outputChannels', 'normalize', 'outputSummary', 'exportZip', 'exportStatus'];
    const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
    let buffer = null, context = null, fileName = '', regions = [], nextId = 1, sourceBitDepth = null, sourceSampleRate = null;
    let selected = null, selectedMarker = null, viewStart = 0, viewLength = 1;
    let undo = [], redo = [], peaks = [], busy = false, drag = null;
    let source = null, gainNode = null, playing = null, frame = 0, zipPromise = null, overviewDrag = null, overviewWindowDrag = null;
    const rate = () => buffer ? buffer.sampleRate : 1;
    const region = () => regions.find(r => r.id === selected);
    const snapshot = () => JSON.stringify({ regions, selected, selectedMarker, nextId });
    function saveHistory(before = snapshot()) { undo.push(before); if (undo.length > 100) undo.shift(); redo = []; }
    function restore(value) { stop(); const state = JSON.parse(value); ({ regions, selected, selectedMarker, nextId } = state); render(); }
    function status(message, error = false, target = ui.status) { target.textContent = message; target.classList.toggle('error', error); }
    function setBusy(value) {
        busy = value;
        document.querySelectorAll('.panel').forEach(el => { el.inert = value; });
        document.querySelector('main').setAttribute('aria-busy', String(value));
        buttons();
    }
    function buttons() {
        const ready = !!buffer && !busy;
        ['fit', 'selectAll', 'selectNone', 'outputRate', 'outputBits'].forEach(id => { ui[id].disabled = !ready; });
        ui.outputChannels.disabled = !ready || buffer.numberOfChannels === 1;
        ui.normalize.disabled = !ready;
        ui.play.disabled = !ready || !region(); ui.stop.disabled = !source;
        ui.deleteMarker.disabled = !ready || selectedMarker === null;
        ui.exportZip.disabled = !ready || !regions.some(r => r.checked);
        ui.emptyWave.hidden = !!buffer;
        ui.count.textContent = `${regions.length}区間 · 保存対象 ${regions.filter(r => r.checked).length}区間`;
        const r = region();
        ui.selectionInfo.textContent = r ? `${C.time(r.start / rate())} → ${C.time(r.end / rate())} (${C.time((r.end - r.start) / rate())})` : '区間未選択';
    }
    function renumberAutoNames() {
        regions.forEach((r, index) => {
            if (r.autoName !== false) r.name = `Clip ${String(index + 1).padStart(2, '0')}`;
        });
    }
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    async function makePeaks(audio) {
        const block = 128, count = Math.ceil(audio.length / block);
        const low = new Float32Array(count), high = new Float32Array(count);
        const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
        for (let b = 0; b < count; b++) {
            let min = 0, max = 0;
            for (const data of channels) for (let i = b * block, end = Math.min(audio.length, (b + 1) * block); i < end; i++) {
                min = Math.min(min, data[i]); max = Math.max(max, data[i]);
            }
            low[b] = min; high[b] = max;
            if (b % 8192 === 8191) await tick();
        }
        const result = [{ block, low, high }];
        while (result[result.length - 1].low.length > 1024) {
            const prev = result[result.length - 1], n = Math.ceil(prev.low.length / 8);
            const lo = new Float32Array(n), hi = new Float32Array(n);
            for (let i = 0; i < n; i++) for (let j = i * 8; j < Math.min(prev.low.length, i * 8 + 8); j++) {
                lo[i] = Math.min(lo[i], prev.low[j]); hi[i] = Math.max(hi[i], prev.high[j]);
            }
            result.push({ block: prev.block * 8, low: lo, high: hi });
        }
        return result;
    }
    function detectWavMetadata(bytes) {
        if (bytes.byteLength < 36) return null;
        const view = new DataView(bytes), ascii = (offset, length) => String.fromCharCode(...new Uint8Array(bytes, offset, length));
        if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') return null;
        let offset = 12;
        while (offset + 8 <= bytes.byteLength) {
            const id = ascii(offset, 4), size = view.getUint32(offset + 4, true);
            if (id === 'fmt ' && size >= 16 && offset + 8 + size <= bytes.byteLength) {
                const format = view.getUint16(offset + 8, true), bits = view.getUint16(offset + 8 + 14, true);
                const sampleRate = view.getUint32(offset + 8 + 4, true);
                if (format === 1 && [8, 16, 24, 32].includes(bits)) return { bitDepth: bits, sampleRate };
                if (format === 3 && bits === 32) return { bitDepth: '32f', sampleRate };
                if (format === 0xfffe && size >= 40) {
                    const subtype = view.getUint32(offset + 8 + 24, true);
                    if (subtype === 1 && [8, 16, 24, 32].includes(bits)) return { bitDepth: bits, sampleRate };
                    if (subtype === 3 && bits === 32) return { bitDepth: '32f', sampleRate };
                }
                return null;
            }
            offset += 8 + size + (size % 2);
        }
        return null;
    }
    function setOutputDefaults(sampleRate, bits) {
        const rateValue = String(sampleRate), rateOption = [...ui.outputRate.options].find(option => option.value === rateValue);
        if (!rateOption) { const option = document.createElement('option'); option.value = rateValue; option.textContent = `${(sampleRate / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} kHz`; ui.outputRate.append(option); }
        ui.outputRate.value = rateValue;
        const bitValue = String(bits || 16), bitOption = [...ui.outputBits.options].find(option => option.value === bitValue);
        ui.outputBits.value = bitOption ? bitValue : '16';
        ui.outputChannels.value = buffer.numberOfChannels === 1 ? 'mono' : 'same';
        ui.normalize.value = 'off';
        updateOutputSummary();
    }
    function updateOutputSummary() {
        const bits = ui.outputBits.value === '32f' ? '32 bit float' : `${ui.outputBits.value || '—'} bit PCM`;
        const channels = !buffer ? '—' : ui.outputChannels.value === 'mono' ? 'モノラル' : ui.outputChannels.value === 'stereo' ? 'ステレオ' : `${buffer.numberOfChannels}ch`;
        const normalize = ui.normalize?.value && ui.normalize.value !== 'off' ? ` / ノーマライズ ${ui.normalize.value} dBFS` : '';
        ui.outputSummary.textContent = `WAV / ${bits} / ${ui.outputRate.value ? `${Number(ui.outputRate.value).toLocaleString()} Hz` : '読み込み後に設定'} / ${channels}${normalize}`;
    }
    async function load(file) {
        if (!file || busy) return;
        if (file.type.startsWith('video/') || (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|aac|ogg|flac|aiff?|opus)$/i.test(file.name))) {
            status('音声ファイルを選んでください。動画は動画音声抽出ツールで音声に変換してください。', true); return;
        }
        stop(); setBusy(true); status('音声を読み込み中…');
        try {
            context ||= new AudioContext();
            const bytes = await file.arrayBuffer();
            const wavMetadata = detectWavMetadata(bytes);
            sourceBitDepth = wavMetadata?.bitDepth || 16;
            const decoded = await context.decodeAudioData(bytes.slice(0));
            if (!decoded.length) throw new Error('音声が空です。');
            status('波形を作成中…');
            const built = await makePeaks(decoded);
            buffer = decoded; peaks = built; fileName = file.name.replace(/\.[^.]+$/, '');
            sourceSampleRate = wavMetadata?.sampleRate || buffer.sampleRate;
            setOutputDefaults(sourceSampleRate, sourceBitDepth);
            nextId = 2; regions = [{ id: 1, start: 0, end: buffer.length, name: 'Clip 01', autoName: true, checked: true }];
            selected = 1; selectedMarker = null; undo = []; redo = [];
            viewStart = 0; viewLength = buffer.length;
            const sourceBitsLabel = sourceBitDepth === '32f' ? '32 bit float' : `${sourceBitDepth} bit`;
            ui.fileInfo.textContent = `${file.name} · ${C.time(buffer.duration)} · ${sourceSampleRate.toLocaleString()} Hz / ${buffer.numberOfChannels} ch / ${sourceBitsLabel}`;
            status('マーカーレーンをクリックして区切りを追加してください。');
            status(`WAV / ${sourceBitDepth === '32f' ? '32bit float' : `${sourceBitDepth}bit PCM`} / ${sourceSampleRate.toLocaleString()} Hzを初期設定にしました。`, false, ui.exportStatus);
            render();
        } catch (error) { status(`読み込めませんでした。対応する音声ファイルか確認してください。${error.message ? ` (${error.message})` : ''}`, true); }
        finally { ui.file.value = ''; setBusy(false); }
    }
    function setupCanvas(canvas) {
        const width = Math.max(1, canvas.clientWidth), height = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
        const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
        return { ctx, width, height };
    }
    function waveform(ctx, width, top, height, start, length, color) {
        const perPixel = length / width;
        let level = null;
        for (const candidate of peaks) if (candidate.block <= perPixel) level = candidate;
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = 0; x < width; x++) {
            const from = Math.floor(start + x * perPixel), to = Math.min(buffer.length, Math.max(from + 1, Math.ceil(start + (x + 1) * perPixel)));
            let min = 0, max = 0;
            if (level) {
                for (let i = Math.floor(from / level.block); i < Math.ceil(to / level.block); i++) { min = Math.min(min, level.low[i]); max = Math.max(max, level.high[i]); }
            } else {
                for (let c = 0; c < buffer.numberOfChannels; c++) {
                    const data = buffer.getChannelData(c);
                    for (let i = from; i < to; i++) { min = Math.min(min, data[i]); max = Math.max(max, data[i]); }
                }
            }
            ctx.moveTo(x + .5, top + height / 2 - max * height * .44);
            ctx.lineTo(x + .5, top + height / 2 - min * height * .44 + .5);
        }
        ctx.stroke();
    }
    function draw() {
        const { ctx, width, height } = setupCanvas(ui.wave);
        if (!buffer) return;
        for (const r of regions) {
            const left = (r.start - viewStart) / viewLength * width, right = (r.end - viewStart) / viewLength * width;
            if (right < 0 || left > width) continue;
            ctx.fillStyle = r.id === selected ? '#1c5264' : r.checked ? (regions.indexOf(r) % 2 ? '#192e42' : '#142539') : '#0c131e';
            ctx.fillRect(left, 58, right - left, height - 58);
            if (r.id === selected) { ctx.strokeStyle = '#58d9f6'; ctx.strokeRect(Math.max(0, left) + .5, 58.5, Math.min(width, right) - Math.max(0, left) - 1, height - 59); }
        }
        ctx.font = '11px monospace'; ctx.textBaseline = 'top';
        const desired = viewLength / rate() / (width / 115), steps = [.001,.002,.005,.01,.02,.05,.1,.2,.5,1,2,5,10,15,30,60,120,300,600,1800,3600];
        const step = steps.find(s => s >= desired) || 7200;
        for (let seconds = Math.ceil(viewStart / rate() / step) * step; seconds <= (viewStart + viewLength) / rate(); seconds += step) {
            const x = (seconds * rate() - viewStart) / viewLength * width;
            ctx.strokeStyle = '#7085a02b'; ctx.beginPath(); ctx.moveTo(x, 56); ctx.lineTo(x, height); ctx.stroke();
            ctx.fillStyle = '#9cacc3'; ctx.fillText(C.time(seconds), x + 4, 39);
        }
        waveform(ctx, width, 65, height - 75, viewStart, viewLength, '#83d8e6');
        ui.viewInfo.textContent = `${C.time(viewStart / rate())} — ${C.time((viewStart + viewLength) / rate())}`;
        ui.overviewWindow.style.left = `${viewStart / buffer.length * 100}%`;
        ui.overviewWindow.style.width = `${viewLength / buffer.length * 100}%`;
        drawMarkers();
    }
    function drawOverview() {
        const { ctx, width, height } = setupCanvas(ui.overview);
        if (buffer) waveform(ctx, width, 0, height, 0, buffer.length, '#6394ad');
    }
    function drawMarkers() {
        ui.markers.replaceChildren();
        regions.slice(0, -1).forEach((r, index) => {
            const percent = (r.end - viewStart) / viewLength * 100;
            if (percent < 0 || percent > 100) return;
            const marker = document.createElement('div'); marker.className = `marker${selectedMarker === r.id ? ' active' : ''}`; marker.style.left = `${percent}%`;
            const handle = document.createElement('button'); handle.type = 'button'; handle.textContent = index + 1;
            handle.dataset.marker = r.id; handle.title = `区切り ${index + 1}: ${C.time(r.end / rate())}（ドラッグで移動）`;
            handle.setAttribute('aria-label', handle.title); marker.append(handle); ui.markers.append(marker);
        });
    }
    function field(value, className, label, onChange) {
        const input = document.createElement('input'); input.type = 'text'; input.value = value; input.className = className;
        input.setAttribute('aria-label', label); input.addEventListener('change', () => onChange(input)); return input;
    }
    function table() {
        ui.regions.replaceChildren();
        regions.forEach((r, index) => {
            const row = document.createElement('tr'); row.className = `${r.id === selected ? 'selected ' : ''}${r.checked ? '' : 'excluded'}`;
            row.dataset.id = r.id;
            const cell = child => { const td = document.createElement('td'); if (typeof child === 'string') td.textContent = child; else td.append(child); row.append(td); return td; };
            const check = document.createElement('input'); check.type = 'checkbox'; check.checked = r.checked; check.setAttribute('aria-label', `${r.name}を保存対象にする`);
            check.addEventListener('change', () => { saveHistory(); r.checked = check.checked; row.classList.toggle('excluded', !r.checked); draw(); buttons(); }); cell(check);
            cell(field(r.name, 'name', `Clip ${index + 1}の名前`, input => { saveHistory(); const automatic = `Clip ${String(index + 1).padStart(2, '0')}`, value = input.value.trim(); r.autoName = !value || value === automatic; r.name = value || automatic; input.value = r.name; buttons(); }));
            const start = field(C.time(r.start / rate()), 'time', `区間 ${index + 1}の開始時刻`, input => editTime(index - 1, input)); start.disabled = index === 0; cell(start);
            const end = field(C.time(r.end / rate()), 'time', `区間 ${index + 1}の終了時刻`, input => editTime(index, input)); end.disabled = index === regions.length - 1; cell(end);
            const duration = cell(C.time((r.end - r.start) / rate())); duration.className = 'mono';
            const actions = document.createElement('div');
            for (const [label, action] of [['▶ 試聴', () => choose(r.id, true)], ['保存', () => exportOne(r)]]) {
                const button = document.createElement('button'); button.textContent = label; button.type = 'button'; button.addEventListener('click', action); actions.append(button);
            }
            cell(actions).className = 'actions';
            row.addEventListener('click', e => { if (!e.target.closest('button, input')) choose(r.id, true); }); ui.regions.append(row);
        });
    }
    function render() { renumberAutoNames(); table(); draw(); drawOverview(); buttons(); }
    function choose(id, reveal = false) {
        stop(); selected = id; selectedMarker = null;
        const r = region();
        if (reveal && r && (r.end <= viewStart || r.start >= viewStart + viewLength)) viewStart = C.clamp((r.start + r.end - viewLength) / 2, 0, buffer.length - viewLength);
        render();
        play();
    }
    function sampleAt(event, element = ui.detail) {
        const rect = element.getBoundingClientRect(); return Math.round(viewStart + C.clamp((event.clientX - rect.left) / rect.width, 0, 1) * viewLength);
    }
    function addMarker(sample) {
        const index = regions.findIndex(r => sample > r.start && sample < r.end);
        if (index < 0) return;
        // Avoid near-duplicate markers within 8 screen pixels.
        const tolerance = Math.max(1, viewLength / ui.detail.clientWidth * 8);
        if (regions.some(r => Math.abs(r.end - sample) < tolerance || Math.abs(r.start - sample) < tolerance)) {
            status('境界に近すぎます。拡大してから区切りを追加してください。'); return;
        }
        stop(); saveHistory(); const r = regions[index], id = nextId++;
        regions.splice(index, 1, { ...r, end: sample }, { ...r, id, start: sample, name: `Clip ${String(index + 2).padStart(2, '0')}`, autoName: true });
        selectedMarker = r.id; selected = r.id; render(); status('区切りを追加しました。つまみをドラッグして調整できます。');
    }
    function moveBoundary(index, value) {
        const left = regions[index], right = regions[index + 1]; if (!left || !right) return;
        const sample = C.clamp(Math.round(value), left.start + 1, right.end - 1);
        left.end = sample; right.start = sample;
    }
    function editTime(index, input) {
        const seconds = C.parseTime(input.value), left = regions[index], right = regions[index + 1];
        const sample = Math.round(seconds * rate());
        if (!left || !right || !Number.isFinite(sample) || sample <= left.start || sample >= right.end) {
            status('前後の区切りの間にある時刻を入力してください。', true); table(); return;
        }
        stop(); saveHistory(); moveBoundary(index, sample); selectedMarker = left.id; render(); status('境界を変更しました。隣接区間にも反映されます。');
    }
    function deleteMarker() {
        const index = regions.findIndex(r => r.id === selectedMarker);
        if (index < 0 || index >= regions.length - 1) return;
        stop(); saveHistory(); const left = regions[index], right = regions[index + 1];
        regions.splice(index, 2, { ...left, end: right.end, checked: left.checked || right.checked });
        selected = left.id; selectedMarker = null; render(); status('左右の区間を結合しました。名前は左側、保存対象はどちらかがオンなら引き継ぎます。');
    }
    function fadeMs() { return C.clamp(Number(ui.fade.value) || 0, 0, 10000); }
    function outputRate() { return Number(ui.outputRate.value) || buffer.sampleRate; }
    function outputBits() { return ui.outputBits.value || String(sourceBitDepth || 16); }
    function outputChannelCount() {
        if (ui.outputChannels.value === 'mono') return 1;
        if (ui.outputChannels.value === 'stereo') return 2;
        return buffer.numberOfChannels;
    }
    function copyRegionBuffer(r) {
        const frames = Math.max(1, r.end - r.start), channels = outputChannelCount(), output = context.createBuffer(channels, frames, buffer.sampleRate);
        if (channels === 1 && buffer.numberOfChannels > 1) {
            const mixed = new Float32Array(frames), left = buffer.getChannelData(0), right = buffer.getChannelData(1);
            for (let i = 0; i < frames; i++) mixed[i] = (left[r.start + i] + right[r.start + i]) * 0.5;
            output.copyToChannel(mixed, 0);
        } else {
            for (let channel = 0; channel < channels; channel++) output.copyToChannel(buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)).subarray(r.start, r.end), channel);
        }
        return output;
    }
    async function outputBufferFor(r) {
        const targetRate = outputRate(), input = copyRegionBuffer(r);
        if (targetRate === input.sampleRate) return input;
        const frames = Math.max(1, Math.round(input.duration * targetRate));
        const offline = new OfflineAudioContext(input.numberOfChannels, frames, targetRate);
        const source = offline.createBufferSource(); source.buffer = input; source.connect(offline.destination);
        source.start(0);
        return offline.startRendering();
    }
    function normalizeBuffer(input) {
        const targetDb = Number(ui.normalize.value);
        if (!Number.isFinite(targetDb)) return input;
        let peak = 0;
        for (let channel = 0; channel < input.numberOfChannels; channel++) for (const sample of input.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
        if (!peak) return input;
        const gain = (10 ** (targetDb / 20)) / peak;
        if (Math.abs(gain - 1) < 1e-6) return input;
        const output = context.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
        for (let channel = 0; channel < input.numberOfChannels; channel++) {
            const source = input.getChannelData(channel), target = output.getChannelData(channel);
            for (let i = 0; i < source.length; i++) target[i] = source[i] * gain;
        }
        return output;
    }
    async function prepareOutputBuffer(r) {
        const output = await outputBufferFor(r);
        return ui.normalize.value === 'off' ? output : normalizeBuffer(output);
    }
    function stop() {
        cancelAnimationFrame(frame);
        if (source) { source.onended = null; try { source.stop(); } catch (_) { /* already ended */ } source.disconnect(); }
        if (gainNode) gainNode.disconnect();
        source = null; gainNode = null; playing = null; ui.playhead.hidden = true; buttons();
    }
    async function play() {
        const r = region(); if (!buffer || !r || busy) return;
        stop();
        // A token prevents an async resume from starting playback after stop or a new selection.
        const token = {}; playing = token;
        try {
            await context.resume(); if (playing !== token) return;
            const length = r.end - r.start, duration = length / rate(), fade = C.fadeSamples(fadeMs(), rate(), length);
            source = context.createBufferSource(); source.buffer = buffer;
            gainNode = context.createGain(); source.connect(gainNode); gainNode.connect(context.destination);
            const now = context.currentTime;
            if (fade) {
                const rampEnd = Math.min(fade, (length - 1) / 2), peak = Math.min(1, rampEnd / fade);
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(peak, now + rampEnd / rate());
                gainNode.gain.setValueAtTime(peak, now + (length - 1 - rampEnd) / rate());
                gainNode.gain.linearRampToValueAtTime(0, now + (length - 1) / rate());
            }
            source.onended = () => { const again = ui.loop.checked && selected === r.id; stop(); if (again) play(); };
            source.start(now, r.start / rate(), duration);
            const animate = () => {
                if (!source) return;
                const sample = r.start + (context.currentTime - now) * rate(), percent = (sample - viewStart) / viewLength * 100;
                ui.playhead.hidden = percent < 0 || percent > 100;
                ui.playhead.style.left = `${percent}%`; frame = requestAnimationFrame(animate);
            };
            buttons(); animate();
        } catch (error) { stop(); status(`試聴できませんでした: ${error.message}`, true); }
    }
    function download(blob, name) {
        const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
        document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    function outputName(r) { return `${C.safeName(fileName)}_${String(regions.indexOf(r) + 1).padStart(3, '0')}_${C.safeName(r.name)}.wav`; }
    async function exportOne(r) {
        if (busy) return;
        stop(); setBusy(true); status('WAVを書き出し中…', false, ui.exportStatus);
        try { await tick(); const output = await prepareOutputBuffer(r); download(new Blob([C.encodeWav(output, 0, output.length, fadeMs(), outputBits())], { type: 'audio/wav' }), outputName(r)); status('WAVのダウンロードを開始しました。', false, ui.exportStatus); }
        catch (error) { status(`保存できませんでした: ${error.message}`, true, ui.exportStatus); }
        finally { setBusy(false); }
    }
    function loadZip() {
        if (window.JSZip) return Promise.resolve(window.JSZip);
        if (zipPromise) return zipPromise;
        zipPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script'); script.src = 'vendor/jszip.min.js';
            const timer = setTimeout(() => { script.remove(); reject(new Error('ZIPライブラリの読み込みがタイムアウトしました。ページを再読み込みするか、個別にWAV保存してください。')); }, 20000);
            script.onload = () => { clearTimeout(timer); if (window.JSZip) resolve(window.JSZip); else reject(new Error('ZIPライブラリを読み込めませんでした。')); };
            script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('ZIPライブラリを読み込めません。ページを再読み込みするか、個別にWAV保存してください。')); };
            document.head.append(script);
        }).catch(error => { zipPromise = null; throw error; });
        return zipPromise;
    }
    async function exportZip() {
        const chosen = regions.filter(r => r.checked); if (!chosen.length || busy) return;
        stop(); setBusy(true); status('ZIP保存の準備中…', false, ui.exportStatus);
        try {
            const Zip = await loadZip(), zip = new Zip(), fade = fadeMs();
            for (let i = 0; i < chosen.length; i++) {
                status(`WAV作成中 ${i + 1} / ${chosen.length}`, false, ui.exportStatus); await tick();
                const r = chosen[i], output = await prepareOutputBuffer(r); zip.file(outputName(r), C.encodeWav(output, 0, output.length, fade, outputBits()));
            }
            const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, info => status(`ZIP作成中 ${Math.round(info.percent)}%`, false, ui.exportStatus));
            download(blob, `${C.safeName(fileName)}_chops.zip`); status(`${chosen.length}区間のZIPダウンロードを開始しました。`, false, ui.exportStatus);
        } catch (error) { status(`保存できませんでした: ${error.message}`, true, ui.exportStatus); }
        finally { setBusy(false); }
    }
    ui.file.addEventListener('change', () => load(ui.file.files[0]));
    ui.dropZone.addEventListener('dragover', e => { e.preventDefault(); if (!busy) ui.dropZone.classList.add('dragover'); });
    ui.dropZone.addEventListener('dragleave', () => ui.dropZone.classList.remove('dragover'));
    ui.dropZone.addEventListener('drop', e => { e.preventDefault(); ui.dropZone.classList.remove('dragover'); load(e.dataTransfer.files[0]); });
    // Prevent a dropped file outside the input panel from navigating away from edits.
    window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());
    ui.markerLane.addEventListener('click', e => { if (buffer && !busy) addMarker(sampleAt(e)); });
    ui.wave.addEventListener('click', e => { if (!buffer || busy) return; const sample = sampleAt(e); const r = regions.find(r => sample >= r.start && sample < r.end) || regions[regions.length - 1]; choose(r.id); });
    ui.markers.addEventListener('pointerdown', e => {
        const handle = e.target.closest('[data-marker]'); if (!handle || busy) return;
        e.preventDefault(); stop(); selectedMarker = Number(handle.dataset.marker);
        drag = { index: regions.findIndex(r => r.id === selectedMarker), before: snapshot(), original: sampleAt(e), start: regions.find(r => r.id === selectedMarker).end };
        ui.detail.setPointerCapture(e.pointerId); drawMarkers(); buttons();
    });
    ui.detail.addEventListener('pointermove', e => {
        if (!drag) return;
        moveBoundary(drag.index, drag.start + sampleAt(e) - drag.original); draw(); buttons();
    });
    const endDrag = e => {
        if (!drag) return;
        if (regions[drag.index].end !== drag.start) saveHistory(drag.before);
        drag = null; if (ui.detail.hasPointerCapture(e.pointerId)) ui.detail.releasePointerCapture(e.pointerId); render();
    };
    ui.detail.addEventListener('pointerup', endDrag); ui.detail.addEventListener('pointercancel', endDrag);
    ui.markers.addEventListener('click', e => { const handle = e.target.closest('[data-marker]'); if (handle) { selectedMarker = Number(handle.dataset.marker); drawMarkers(); buttons(); } });
    ui.markers.addEventListener('keydown', e => {
        const handle = e.target.closest('[data-marker]'); if (!handle) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); selectedMarker = Number(handle.dataset.marker); deleteMarker(); }
    });
    function overviewSample(event) {
        const rect = ui.overview.getBoundingClientRect();
        return C.clamp(Math.round((event.clientX - rect.left) / rect.width * buffer.length), 0, buffer.length);
    }
    function overviewDelta(event) {
        const rect = ui.overview.getBoundingClientRect();
        return Math.round((event.clientX - overviewWindowDrag.startX) / rect.width * buffer.length);
    }
    ui.overviewWindow.addEventListener('pointerdown', e => {
        if (!buffer || busy) return;
        e.stopPropagation(); e.preventDefault();
        const edge = e.target.closest('[data-edge]')?.dataset.edge || 'move';
        overviewWindowDrag = { mode: edge, startX: e.clientX, start: viewStart, end: viewStart + viewLength };
        ui.overviewWindow.setPointerCapture(e.pointerId);
    });
    ui.overviewWindow.addEventListener('pointermove', e => {
        if (!overviewWindowDrag || !ui.overviewWindow.hasPointerCapture(e.pointerId)) return;
        const delta = overviewDelta(e), minimum = Math.max(1, Math.round(rate() * .05));
        if (overviewWindowDrag.mode === 'start') {
            const start = C.clamp(overviewWindowDrag.start + delta, 0, overviewWindowDrag.end - minimum);
            viewStart = start; viewLength = overviewWindowDrag.end - start;
        } else if (overviewWindowDrag.mode === 'end') {
            const end = C.clamp(overviewWindowDrag.end + delta, overviewWindowDrag.start + minimum, buffer.length);
            viewStart = overviewWindowDrag.start; viewLength = end - overviewWindowDrag.start;
        } else {
            viewLength = overviewWindowDrag.end - overviewWindowDrag.start;
            viewStart = C.clamp(overviewWindowDrag.start + delta, 0, buffer.length - viewLength);
        }
        draw();
    });
    const endOverviewWindowDrag = e => {
        if (!overviewWindowDrag) return;
        overviewWindowDrag = null;
        if (ui.overviewWindow.hasPointerCapture(e.pointerId)) ui.overviewWindow.releasePointerCapture(e.pointerId);
    };
    ui.overviewWindow.addEventListener('pointerup', endOverviewWindowDrag);
    ui.overviewWindow.addEventListener('pointercancel', endOverviewWindowDrag);
    ui.overview.addEventListener('pointerdown', e => {
        if (!buffer || busy) return;
        ui.overview.setPointerCapture(e.pointerId);
        overviewDrag = { startX: e.clientX, startSample: overviewSample(e), moved: false };
    });
    ui.overview.addEventListener('pointermove', e => {
        if (!overviewDrag || !ui.overview.hasPointerCapture(e.pointerId)) return;
        const endSample = overviewSample(e);
        if (Math.abs(e.clientX - overviewDrag.startX) >= 4) overviewDrag.moved = true;
        if (!overviewDrag.moved) return;
        const start = Math.min(overviewDrag.startSample, endSample), end = Math.max(overviewDrag.startSample, endSample);
        if (end - start < Math.max(1, Math.round(rate() * .05))) return;
        viewStart = start; viewLength = end - start; draw();
    });
    ui.overview.addEventListener('pointerup', e => {
        if (!overviewDrag) return;
        if (!overviewDrag.moved) {
            const center = overviewSample(e);
            viewStart = C.clamp(Math.round(center - viewLength / 2), 0, buffer.length - viewLength); draw();
        }
        overviewDrag = null;
        if (ui.overview.hasPointerCapture(e.pointerId)) ui.overview.releasePointerCapture(e.pointerId);
    });
    ui.overview.addEventListener('pointercancel', () => { overviewDrag = null; });
    ui.fit.addEventListener('click', () => { viewStart = 0; viewLength = buffer.length; draw(); });
    ui.deleteMarker.addEventListener('click', deleteMarker);
    ui.play.addEventListener('click', play); ui.stop.addEventListener('click', stop);
    ui.fade.addEventListener('change', () => { if (source || playing) { stop(); status('フェード時間を変更しました。再度試聴すると反映されます。'); } });
    ui.outputRate.addEventListener('change', updateOutputSummary); ui.outputBits.addEventListener('change', updateOutputSummary); ui.outputChannels.addEventListener('change', updateOutputSummary); ui.normalize.addEventListener('change', updateOutputSummary);
    ui.selectAll.addEventListener('click', () => { saveHistory(); regions.forEach(r => { r.checked = true; }); render(); });
    ui.selectNone.addEventListener('click', () => { saveHistory(); regions.forEach(r => { r.checked = false; }); render(); });
    ui.exportZip.addEventListener('click', exportZip);
    new ResizeObserver(() => { draw(); drawOverview(); }).observe(ui.detail);
    updateOutputSummary(); buttons();
})();
