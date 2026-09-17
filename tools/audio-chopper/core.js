(function (root) {
    'use strict';
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    function time(seconds) {
        const ms = Math.max(0, Math.round(seconds * 1000));
        return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
    }
    function parseTime(value) {
        const parts = String(value).trim().split(':');
        if (parts.length > 3 || parts.some(p => !/^\d+(?:\.\d+)?$/.test(p))) return NaN;
        return parts.reduce((total, p) => total * 60 + Number(p), 0);
    }
    function fadeSamples(ms, rate, length) {
        return Math.min(Math.floor(length / 2), Math.max(0, Math.round(ms * rate / 1000)));
    }
    function fadeGain(i, length, fade) {
        if (!fade) return 1;
        return Math.min(1, i / fade, (length - 1 - i) / fade);
    }
    function normalizeBitDepth(bitDepth) {
        return bitDepth === '32f' || bitDepth === '32-float' ? '32f' : [8, 16, 24, 32].includes(Number(bitDepth)) ? Number(bitDepth) : 16;
    }
    function encodeWav(buffer, start, end, fadeMs = 0, bitDepth = 16) {
        start = clamp(Math.round(start), 0, buffer.length);
        end = clamp(Math.round(end), start, buffer.length);
        const depth = normalizeBitDepth(bitDepth), length = end - start, channels = buffer.numberOfChannels, rate = buffer.sampleRate;
        if (!length) throw new Error('空の区間は保存できません。');
        const bytesPerSample = depth === '32f' || depth === 32 ? 4 : depth / 8;
        const blockAlign = channels * bytesPerSample;
        const data = new ArrayBuffer(44 + length * blockAlign), view = new DataView(data);
        const str = (at, text) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
        str(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, depth === '32f' ? 3 : 1, true); view.setUint16(22, channels, true);
        view.setUint32(24, rate, true); view.setUint32(28, rate * blockAlign, true);
        view.setUint16(32, blockAlign, true); view.setUint16(34, depth === '32f' ? 32 : depth, true);
        str(36, 'data'); view.setUint32(40, length * blockAlign, true);
        const source = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
        const fade = fadeSamples(fadeMs, rate, length);
        for (let i = 0, at = 44; i < length; i++) {
            const gain = fadeGain(i, length, fade);
            for (let c = 0; c < channels; c++, at += bytesPerSample) {
                const sample = clamp(source[c][start + i] * gain, -1, 1);
                if (depth === '32f') view.setFloat32(at, sample, true);
                else if (depth === 32) view.setInt32(at, Math.round(sample * (sample < 0 ? 2147483648 : 2147483647)), true);
                else if (depth === 8) view.setUint8(at, Math.round((sample + 1) * 127.5));
                else if (depth === 16) view.setInt16(at, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
                else {
                    const value = Math.round(sample * (sample < 0 ? 8388608 : 8388607));
                    view.setUint8(at, value & 0xff); view.setUint8(at + 1, (value >> 8) & 0xff); view.setUint8(at + 2, (value >> 16) & 0xff);
                }
            }
        }
        return data;
    }
    function safeName(value) {
        return String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 100) || 'clip';
    }
    const api = { clamp, time, parseTime, fadeSamples, fadeGain, encodeWav, safeName, normalizeBitDepth };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ChopCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
