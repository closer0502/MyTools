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
    function encodeWav(buffer, start, end, fadeMs = 0) {
        start = clamp(Math.round(start), 0, buffer.length);
        end = clamp(Math.round(end), start, buffer.length);
        const length = end - start, channels = buffer.numberOfChannels, rate = buffer.sampleRate;
        if (!length) throw new Error('空の区間は保存できません。');
        const data = new ArrayBuffer(44 + length * channels * 2), view = new DataView(data);
        const str = (at, text) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
        str(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
        view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true);
        view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
        str(36, 'data'); view.setUint32(40, length * channels * 2, true);
        const source = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
        const fade = fadeSamples(fadeMs, rate, length);
        for (let i = 0, at = 44; i < length; i++) {
            const gain = fadeGain(i, length, fade);
            for (let c = 0; c < channels; c++, at += 2) {
                const sample = clamp(source[c][start + i] * gain, -1, 1);
                view.setInt16(at, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
            }
        }
        return data;
    }
    function safeName(value) {
        return String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 100) || 'clip';
    }
    const api = { clamp, time, parseTime, fadeSamples, fadeGain, encodeWav, safeName };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ChopCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
