/* Pure image operations, shared by the browser and Node's regression tests. */
(function (root) {
    'use strict';
    const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
    function parsePalette(text) {
        const tokens = text.trim() ? text.trim().split(/[\s,;]+/) : [];
        if (tokens.some(t => !/^#[0-9a-f]{6}$/i.test(t))) throw new Error('色は #RRGGBB 形式で指定してください。');
        return [...new Set(tokens.map(t => t.toLowerCase()))].map(t => [1, 3, 5].map(i => parseInt(t.slice(i, i + 2), 16)));
    }
    function geometry(image, width) {
        const cell = image.width / width;
        return { width, height: Math.ceil(image.height / cell - 1e-9), cell };
    }
    function sample(image, options) {
        const { width, offsetX, offsetY, sampling, alpha } = options;
        const g = geometry(image, width);
        if (!Number.isInteger(width) || width < 1 || width > 512 || g.height > 2048 || width * g.height > 262144) throw new Error('出力は幅1〜512px、高さ2048px以下、合計262,144px以下にしてください。');
        const output = new Uint8ClampedArray(width * g.height * 4);
        // Bound work per cell; regular stratified samples avoid huge-image stalls.
        const n = sampling === 'center' ? 1 : Math.min(8, Math.max(1, Math.ceil(g.cell)));
        for (let y = 0; y < g.height; y++) for (let x = 0; x < width; x++) {
            const bins = new Map();
            let covered = 0, sumAlpha = 0, sums = [0, 0, 0];
            for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) {
                const ix = Math.floor(offsetX + (x + (sx + .5) / n) * g.cell);
                const iy = Math.floor(offsetY + (y + (sy + .5) / n) * g.cell);
                if (ix < 0 || iy < 0 || ix >= image.width || iy >= image.height) continue;
                const i = (iy * image.width + ix) * 4, a = image.data[i + 3];
                covered += a;
                if (!a) continue;
                const c = Array.from(image.data.slice(i, i + 3));
                sumAlpha += a;
                c.forEach((v, k) => sums[k] += v * a);
                const key = c.map(v => v >> 3).join(',');
                if (!bins.has(key)) bins.set(key, { weight: 0, sums: [0, 0, 0] });
                const bin = bins.get(key);
                bin.weight += a;
                c.forEach((v, k) => bin.sums[k] += v * a);
            }
            if (covered / (n * n) < alpha || !sumAlpha) continue;
            let color = sums.map(v => Math.round(v / sumAlpha));
            if (sampling === 'mode') {
                const best = [...bins.values()].reduce((a, b) => b.weight > a.weight ? b : a);
                color = best.sums.map(v => Math.round(v / best.weight));
            }
            output.set([...color, 255], (y * width + x) * 4);
        }
        return { width, height: g.height, data: output };
    }
    function makePalette(data, count) {
        if (!count) return [];
        const histogram = new Map();
        for (let i = 0; i < data.length; i += 4) if (data[i + 3]) {
            const c = Array.from(data.slice(i, i + 3)), key = c.join(',');
            if (!histogram.has(key)) histogram.set(key, { c, n: 0 });
            histogram.get(key).n++;
        }
        if (!histogram.size) return [];
        const describe = items => {
            const ranges = [0, 1, 2].map(k => {
                let min = 255, max = 0;
                for (const p of items) { min = Math.min(min, p.c[k]); max = Math.max(max, p.c[k]); }
                return max - min;
            });
            return { items, axis: ranges.indexOf(Math.max(...ranges)), score: Math.max(...ranges) * Math.sqrt(items.reduce((s, p) => s + p.n, 0)) };
        };
        const boxes = [describe([...histogram.values()])];
        while (boxes.length < count) {
            let index = -1;
            boxes.forEach((b, i) => { if (b.items.length > 1 && (index < 0 || b.score > boxes[index].score)) index = i; });
            if (index < 0) break;
            const { items, axis } = boxes.splice(index, 1)[0];
            items.sort((a, b) => a.c[axis] - b.c[axis]);
            const half = items.reduce((s, p) => s + p.n, 0) / 2;
            let sum = 0, split = 0;
            do { sum += items[split++].n; } while (sum < half && split < items.length - 1);
            split = Math.min(split, items.length - 1);
            boxes.push(describe(items.slice(0, split)), describe(items.slice(split)));
        }
        return boxes.map(({ items }) => {
            const total = items.reduce((s, p) => s + p.n, 0);
            return [0, 1, 2].map(k => Math.round(items.reduce((s, p) => s + p.c[k] * p.n, 0) / total));
        });
    }
    function quantize(image, count, fixed, custom) {
        if (count && fixed.length > count) throw new Error('固定色の数が色数の上限を超えています。');
        if (fixed.length > 256) throw new Error('指定できる色は256色までです。');
        if (custom && !fixed.length) throw new Error('指定パレットに1色以上を入力してください。');
        if (!custom && !count) return image;
        const palette = custom ? fixed : [...fixed, ...makePalette(image.data, count - fixed.length)];
        const data = image.data.slice(), cache = new Map();
        for (let i = 0; i < data.length; i += 4) if (data[i + 3]) {
            const key = data[i] * 65536 + data[i + 1] * 256 + data[i + 2];
            if (!cache.has(key)) {
                let best = palette[0], distance = Infinity;
                for (const c of palette) {
                    const d = c.reduce((s, v, k) => s + (v - data[i + k]) ** 2, 0);
                    if (d < distance) { distance = d; best = c; }
                }
                cache.set(key, best);
            }
            data.set(cache.get(key), i);
        }
        return { ...image, data };
    }
    function estimate(image) {
        // Sum alpha-aware edge energy along both axes, then find recurring peaks.
        const profiles = [new Float64Array(image.width), new Float64Array(image.height)];
        for (let axis = 0; axis < 2; axis++) {
            const length = profiles[axis].length, across = axis ? image.width : image.height;
            const step = Math.max(1, Math.ceil(across / 128));
            for (let p = 1; p < length; p++) for (let q = 0; q < across; q += step) {
                const i = (axis ? p * image.width + q : q * image.width + p) * 4;
                const j = i - (axis ? image.width * 4 : 4);
                let d = Math.abs(image.data[i + 3] - image.data[j + 3]);
                for (let k = 0; k < 3; k++) d += Math.abs(image.data[i + k] * image.data[i + 3] / 255 - image.data[j + k] * image.data[j + 3] / 255);
                profiles[axis][p] += d;
            }
        }
        const votes = new Map();
        for (const profile of profiles) {
            const max = profile.reduce((a, b) => Math.max(a, b), 0);
            let previous = -1;
            for (let p = 1; p < profile.length - 1; p++) if (profile[p] > max * .2 && profile[p] >= profile[p - 1] && profile[p] > profile[p + 1]) {
                const gap = p - previous;
                if (previous >= 0 && gap >= 2 && gap <= 128) votes.set(gap, (votes.get(gap) || 0) + Math.min(profile[p], profile[previous]));
                previous = p;
            }
        }
        if (!votes.size) return null;
        const cell = [...votes].sort((a, b) => b[1] - a[1])[0][0];
        const width = Math.round(image.width / cell);
        if (width < 1 || width > 512) return null;
        const actual = image.width / width;
        const offsets = profiles.map(profile => {
            const bins = new Float64Array(Math.max(1, Math.round(actual * 4)));
            profile.forEach((v, p) => { bins[Math.round((p % actual) / actual * bins.length) % bins.length] += v; });
            let best = 0;
            bins.forEach((v, i) => { if (v > bins[best]) best = i; });
            let offset = best / bins.length * actual;
            if (offset > actual / 2) offset -= actual;
            return Math.round(offset * 4) / 4;
        });
        return { width, offsetX: offsets[0], offsetY: offsets[1] };
    }
    const api = { hex, parsePalette, geometry, sample, quantize, estimate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PixelCore = api;
})(globalThis);
