const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('./core.js');
function image(w, h, pixel) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4);
    return { width: w, height: h, data };
}
const config = { width: 2, offsetX: 0, offsetY: 0, sampling: 'mode', alpha: 128 };
test('restores exact expanded pixels for all sampling modes', () => {
    const input = image(16, 16, (x, y) => [x < 8 ? 20 : 210, y < 8 ? 30 : 180, 80, 255]);
    for (const sampling of ['center', 'mode', 'average']) {
        const result = core.sample(input, { ...config, sampling });
        assert.deepEqual([...result.data], [20, 30, 80, 255, 210, 30, 80, 255, 20, 180, 80, 255, 210, 180, 80, 255]);
    }
});
test('offsets sample the shifted grid and never wrap out-of-bounds pixels', () => {
    const input = image(8, 4, (x) => x >= 2 && x < 6 ? [255, 0, 0, 255] : [0, 0, 0, 0]);
    assert.deepEqual([...core.sample(input, { ...config, offsetX: 2 }).data], [255, 0, 0, 255, 0, 0, 0, 0]);
});
test('transparent RGB cannot contaminate opaque averages; alpha is binary', () => {
    const input = image(2, 2, x => x ? [255, 0, 0, 255] : [0, 0, 255, 0]);
    assert.deepEqual([...core.sample(input, { ...config, width: 1, sampling: 'average', alpha: 127 }).data], [255, 0, 0, 255]);
    assert.deepEqual([...core.sample(input, { ...config, width: 1, alpha: 128 }).data], [0, 0, 0, 0]);
});
test('square cells keep a partial bottom row and reject extreme output geometry', () => {
    assert.deepEqual(core.geometry({ width: 10, height: 7 }, 3), { width: 3, height: 3, cell: 10 / 3 });
    assert.throws(() => core.sample(image(1, 5, () => [0, 0, 0, 255]), { ...config, width: 512 }), /2048/);
});
test('quantization enforces its budget and preserves supplied palette colors', () => {
    const input = image(32, 32, (x, y) => [x * 8, y * 8, (x + y) * 4, 255]);
    for (const count of [4, 8, 16, 32]) {
        const result = core.quantize(input, count, [[255, 0, 0]], false);
        const used = new Set();
        for (let i = 0; i < result.data.length; i += 4) used.add(result.data.slice(i, i + 3).join(','));
        assert.ok(used.size <= count);
    }
    const result = core.quantize(input, 4, [[255, 0, 0], [0, 0, 0]], true);
    for (let i = 0; i < result.data.length; i += 4) assert.ok(result.data[i + 1] === 0 && result.data[i + 2] === 0);
    assert.throws(() => core.quantize(input, 1, [[0, 0, 0], [255, 0, 0]], false), /上限/);
    assert.throws(() => core.quantize(input, 4, [], true), /1色/);
});
test('transparent-only images and unrestricted output are supported', () => {
    const input = image(2, 2, () => [0, 0, 0, 0]);
    assert.deepEqual(core.quantize(input, 16, [], false).data, input.data);
    assert.equal(core.quantize(input, 0, [], false), input);
});
test('palette parser validates and deduplicates', () => {
    assert.deepEqual(core.parsePalette('#ff0000, #FF0000\n#010203'), [[255, 0, 0], [1, 2, 3]]);
    assert.throws(() => core.parsePalette('red'), /RRGGBB/);
});
test('grid estimation detects an eight-pixel grid and declines a flat image', () => {
    const input = image(256, 256, (x, y) => [(Math.floor(x / 8) % 2) * 255, (Math.floor(y / 8) % 2) * 255, 0, 255]);
    assert.deepEqual(core.estimate(input), { width: 32, offsetX: 0, offsetY: 0 });
    assert.equal(core.estimate(image(32, 32, () => [100, 100, 100, 255])), null);
});
