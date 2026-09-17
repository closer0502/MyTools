const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./core.js');
const audio = (channels, rate = 1000) => ({ length: channels[0].length, sampleRate: rate, numberOfChannels: channels.length, getChannelData: i => Float32Array.from(channels[i]) });
test('WAV exports only the selected samples, preserving stereo order and metadata', () => {
    const data = C.encodeWav(audio([[0, 1, -.5, 0], [0, -.5, 1, 0]]), 1, 3);
    const view = new DataView(data);
    assert.equal(data.byteLength, 52); assert.equal(view.getUint16(22, true), 2);
    assert.equal(view.getUint32(24, true), 1000); assert.equal(view.getUint32(40, true), 8);
    assert.deepEqual([44, 46, 48, 50].map(at => view.getInt16(at, true)), [32767, -16384, -16384, 32767]);
});
test('shared millisecond fades silence both edges without touching the source', () => {
    const input = audio([Array(10).fill(1)]), view = new DataView(C.encodeWav(input, 0, 10, 2));
    const samples = Array.from({ length: 10 }, (_, i) => view.getInt16(44 + i * 2, true));
    assert.deepEqual(samples, [0, 16384, 32767, 32767, 32767, 32767, 32767, 32767, 16384, 0]);
    assert.equal(input.getChannelData(0)[0], 1);
});
test('excessive fades are capped and short clips stay finite', () => {
    assert.equal(C.fadeSamples(10000, 48000, 100), 50);
    for (const length of [1, 2, 3, 4, 9]) {
        const fade = C.fadeSamples(500, 1000, length);
        for (let i = 0; i < length; i++) assert.ok(Number.isFinite(C.fadeGain(i, length, fade)));
    }
    assert.throws(() => C.encodeWav(audio([[1]]), 0, 0), /空/);
});
test('zero fade preserves audio; names and time input are handled safely', () => {
    assert.equal(new DataView(C.encodeWav(audio([[1, -1]]), 0, 2, 0)).getInt16(44, true), 32767);
    assert.equal(C.time(72.125), '01:12.125'); assert.equal(C.parseTime('01:12.125'), 72.125);
    assert.equal(C.parseTime('72.125'), 72.125); assert.ok(Number.isNaN(C.parseTime('bad')));
    assert.equal(C.safeName('../bad:name?'), '.._bad_name_');
});
test('supports selectable 8-bit, 24-bit, and 32-bit float WAV output', () => {
    const input = audio([[0, 1, -1]], 44100);
    const eight = new DataView(C.encodeWav(input, 0, 3, 0, 8));
    assert.equal(eight.getUint16(34, true), 8); assert.deepEqual([44, 45, 46].map(at => eight.getUint8(at)), [128, 255, 0]);
    const twentyFour = new DataView(C.encodeWav(input, 0, 3, 0, 24));
    assert.equal(twentyFour.getUint16(34, true), 24); assert.equal(twentyFour.getUint32(24, true), 44100); assert.equal(twentyFour.getUint8(44), 0);
    const float = new DataView(C.encodeWav(input, 0, 3, 0, '32f'));
    assert.equal(float.getUint16(20, true), 3); assert.equal(float.getFloat32(44, true), 0);
});
