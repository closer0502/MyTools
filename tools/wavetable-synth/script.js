const canvas = document.getElementById("waveCanvas");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

const NOTE_KEYS = [
    { note: "C", midi: 60, key: "a", black: false }, { note: "C#", midi: 61, key: "w", black: true },
    { note: "D", midi: 62, key: "s", black: false }, { note: "D#", midi: 63, key: "e", black: true },
    { note: "E", midi: 64, key: "d", black: false }, { note: "F", midi: 65, key: "f", black: false },
    { note: "F#", midi: 66, key: "t", black: true }, { note: "G", midi: 67, key: "g", black: false },
    { note: "G#", midi: 68, key: "y", black: true }, { note: "A", midi: 69, key: "h", black: false },
    { note: "A#", midi: 70, key: "u", black: true }, { note: "B", midi: 71, key: "j", black: false },
    { note: "C", midi: 72, key: "k", black: false },
];

const presets = {
    sine: [0, .7071, 1, .7071, 0, -.7071, -1, -.7071],
    triangle: [-1, -.5, 0, .5, 1, .5, 0, -.5],
    saw: Array.from({ length: 16 }, (_, index) => -1 + index * (2 / 15)),
    square: [-1, -1, 1, 1],
    pluck: [0, .95, -.62, .43, -.29, .2, -.13, .085, -.052, .03, -.015, .006],
};

let waveformPoints = [];
let curveMode = "spline";
let selectedPoint = 1;
let selectedSegment = 1;
let selectedPoints = new Set([1]);
let hoveredSegment = null;
let drag = null;
let selectionBox = null;
let magnetMode = false;
let collisionPoints = new Set();
let horizontalGrid = 8;
let verticalGrid = 8;
let audioContext = null;
let activeVoices = new Map();
let octave = 4;
let tableWorkletUrl = null;
let tableWorkletReady = null;

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function clonePoints(points) { return points.map((point) => ({ x: point.x, y: point.y, curve: point.curve ?? 1 })); }
function makePoints(values) {
    return values.map((y, index) => {
        const x = index / values.length;
        return { x, y, curve: 1 };
    });
}
function getResolutionValue(name, fallback) {
    const control = document.querySelector(`[data-knob="${name}"]`);
    return control ? Number(control.dataset.value) : fallback;
}
function getHorizontalResolution() { return getResolutionValue("horizontal", 16); }
function getVerticalBitDepth() { return getResolutionValue("vertical", 16); }
function resetWaveform() {
    const base = makePoints(presets.sine);
    waveformPoints = clonePoints(base);
    collisionPoints.clear();
    selectedPoints = new Set([1]);
    selectedPoint = 1;
    selectedSegment = 1;
    syncUI();
}
function currentPoints() { return waveformPoints; }
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawWave();
}
function pointToCanvas(point) {
    const rect = canvas.getBoundingClientRect();
    return { x: point.x * rect.width, y: (1 - (point.y + 1) / 2) * rect.height };
}
function waveToCanvas(x, y, width, height) {
    return { x: x * width, y: (1 - (y + 1) / 2) * height };
}
function canvasToPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const rawY = clamp(1 - ((event.clientY - rect.top) / rect.height) * 2, -1, 1);
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: Math.abs(rawY) < .02 ? 0 : rawY };
}
function drawGrid(width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#10131d";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = magnetMode ? "rgba(124, 133, 166, .065)" : "rgba(124, 133, 166, .13)";
    ctx.lineWidth = 1;
    for (let i = 1; i < horizontalGrid; i += 1) {
        const x = width * i / horizontalGrid;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let i = 1; i < verticalGrid; i += 1) {
        const y = height * i / verticalGrid;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.strokeStyle = magnetMode ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.32)";
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
}
function getSplineModel(points) {
    const count = points.length;
    const lengths = [];
    const slopes = [];
    for (let i = 0; i < count; i += 1) {
        const next = (i + 1) % count;
        const nextX = i === count - 1 ? points[0].x + 1 : points[next].x;
        const length = Math.max(0.0001, nextX - points[i].x);
        lengths.push(length);
        slopes.push((points[next].y - points[i].y) / length);
    }

    const tangents = points.map((_, index) => {
        const left = (index - 1 + count) % count;
        const leftSlope = slopes[left];
        const rightSlope = slopes[index];
        if (leftSlope === 0 || rightSlope === 0 || leftSlope * rightSlope < 0) return 0;
        const leftLength = lengths[left];
        const rightLength = lengths[index];
        const leftWeight = 2 * rightLength + leftLength;
        const rightWeight = rightLength + 2 * leftLength;
        return (leftWeight + rightWeight) / (leftWeight / leftSlope + rightWeight / rightSlope);
    });

    return points.map((point, index) => {
        const next = (index + 1) % count;
        const amount = clamp(point.curve ?? 1, 0, 1);
        const linearSlope = slopes[index];
        return {
            x0: point.x,
            x1: index === count - 1 ? points[0].x + 1 : points[next].x,
            y0: point.y,
            y1: points[next].y,
            curve: amount,
            m0: linearSlope + (tangents[index] - linearSlope) * amount,
            m1: linearSlope + (tangents[next] - linearSlope) * amount,
        };
    });
}
function evaluateSpline(segment, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const length = segment.x1 - segment.x0;
    return h00 * segment.y0 + h10 * length * segment.m0 + h01 * segment.y1 + h11 * length * segment.m1;
}
function drawWave(updateAudio = true) {
    if (!canvas.width) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    drawGrid(width, height);
    const points = currentPoints();
    const spline = curveMode === "spline" ? getSplineModel(points) : null;
    const path = new Path2D();
    const selectedPath = new Path2D();
    const hoveredPath = new Path2D();
    points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        const isWrapSegment = index === points.length - 1;
        const nextX = isWrapSegment ? 1 : next.x;
        const a = pointToCanvas(point);
        const b = { x: nextX * width, y: (1 - (next.y + 1) / 2) * height };
        if (index === 0) path.moveTo(a.x, a.y);
        if (curveMode === "linear") {
            path.lineTo(b.x, b.y);
            if (index === selectedSegment) {
                selectedPath.moveTo(a.x, a.y); selectedPath.lineTo(b.x, b.y);
            }
            if (index === hoveredSegment && index !== selectedSegment) {
                hoveredPath.moveTo(a.x, a.y); hoveredPath.lineTo(b.x, b.y);
            }
        } else {
            const segment = spline[index];
            const h = segment.x1 - segment.x0;
            const c1 = waveToCanvas(segment.x0 + h / 3, segment.y0 + segment.m0 * h / 3, width, height);
            const c2 = waveToCanvas(segment.x1 - h / 3, segment.y1 - segment.m1 * h / 3, width, height);
            path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
            if (index === selectedSegment) {
                selectedPath.moveTo(a.x, a.y); selectedPath.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
            }
            if (index === hoveredSegment && index !== selectedSegment) {
                hoveredPath.moveTo(a.x, a.y); hoveredPath.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
            }
        }
    });
    ctx.save();
    ctx.shadowBlur = 16; ctx.shadowColor = "rgba(139,124,255,.7)";
    ctx.strokeStyle = "#a69cff"; ctx.lineWidth = 3; ctx.stroke(path);
    ctx.restore();
    ctx.strokeStyle = "rgba(72,214,194,.45)"; ctx.lineWidth = 1; ctx.stroke(path);
    if (curveMode === "spline" && hoveredSegment !== null) {
        if (hoveredSegment !== selectedSegment) {
            ctx.strokeStyle = "#48d6c2"; ctx.lineWidth = 5; ctx.stroke(hoveredPath);
        }
        drawCurveGuide(points, spline, hoveredSegment, width, height);
    }
    if (curveMode === "spline") {
        ctx.strokeStyle = "#ffbd68"; ctx.lineWidth = 4; ctx.stroke(selectedPath);
    }
    drawHandles();
    drawSelectionBox();
    if (updateAudio) updateActiveWaveforms();
}
function drawCurveGuide(points, spline, segmentIndex, width, height) {
    const position = getSegmentCanvasPoint(points, segmentIndex, .5, width, height, spline);
    const curve = Math.round((points[segmentIndex].curve ?? 1) * 100);
    const label = `↕ カーブ ${curve}%`;
    ctx.save();
    ctx.font = "600 12px system-ui, sans-serif";
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + 20;
    const boxHeight = 26;
    const boxX = clamp(position.x - boxWidth / 2, 8, width - boxWidth - 8);
    const boxY = clamp(position.y - 42, 8, height - boxHeight - 8);
    ctx.strokeStyle = "rgba(72,214,194,.7)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(position.x, position.y - 7); ctx.lineTo(position.x, boxY + boxHeight); ctx.stroke();
    ctx.fillStyle = "rgba(16,19,29,.94)";
    ctx.strokeStyle = "rgba(72,214,194,.85)";
    ctx.beginPath(); ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#d9fffa";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, boxX + boxWidth / 2, boxY + boxHeight / 2);
    ctx.restore();
}
function drawHandles() {
    currentPoints().forEach((node, index) => {
        const position = pointToCanvas(node);
        const isSelected = selectedPoints.has(index);
        ctx.beginPath(); ctx.arc(position.x, position.y, isSelected ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = collisionPoints.has(index) ? "#ff6262" : isSelected ? "#ffbd68" : "#f3f5ff"; ctx.fill();
        ctx.strokeStyle = "#11141e"; ctx.lineWidth = 2; ctx.stroke();
    });
}
function drawSelectionBox() {
    if (!selectionBox) return;
    const x = Math.min(selectionBox.startX, selectionBox.endX);
    const y = Math.min(selectionBox.startY, selectionBox.endY);
    const width = Math.abs(selectionBox.endX - selectionBox.startX);
    const height = Math.abs(selectionBox.endY - selectionBox.startY);
    ctx.save();
    ctx.fillStyle = "rgba(72,214,194,.12)";
    ctx.strokeStyle = "#48d6c2";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
}

function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
    return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
function getSegmentCanvasPoint(points, index, t, width, height, spline) {
    const segment = spline ? spline[index] : null;
    const start = points[index];
    const next = points[(index + 1) % points.length];
    const endX = index === points.length - 1 ? 1 : next.x;
    const x = start.x + (endX - start.x) * t;
    const y = curveMode === "linear"
        ? start.y + (next.y - start.y) * t
        : evaluateSpline(segment, t);
    return waveToCanvas(x, y, width, height);
}
function findHit(event) {
    const point = canvasToPoint(event);
    const rect = canvas.getBoundingClientRect();
    const nodes = currentPoints();
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const x = Math.abs((node.x - point.x) * rect.width);
        const y = Math.abs((node.y - point.y) * rect.height / 2);
        if (Math.hypot(x, y) < 16) return { type: "point", index: i };
    }
    const spline = curveMode === "spline" ? getSplineModel(nodes) : null;
    const canvasPoint = { x: point.x * rect.width, y: (1 - (point.y + 1) / 2) * rect.height };
    for (let i = 0; i < nodes.length; i += 1) {
        let previous = getSegmentCanvasPoint(nodes, i, 0, rect.width, rect.height, spline);
        for (let step = 1; step <= 24; step += 1) {
            const next = getSegmentCanvasPoint(nodes, i, step / 24, rect.width, rect.height, spline);
            if (distanceToSegment(canvasPoint, previous, next) < 12) return { type: "segment", index: i };
            previous = next;
        }
    }
    return null;
}
function canvasLocalPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function updateBoxSelection() {
    if (!selectionBox) return;
    const rect = canvas.getBoundingClientRect();
    const left = Math.min(selectionBox.startX, selectionBox.endX);
    const right = Math.max(selectionBox.startX, selectionBox.endX);
    const top = Math.min(selectionBox.startY, selectionBox.endY);
    const bottom = Math.max(selectionBox.startY, selectionBox.endY);
    selectedPoints = new Set(currentPoints().map((point, index) => {
        const position = pointToCanvas(point);
        return position.x >= left && position.x <= right && position.y >= top && position.y <= bottom ? index : null;
    }).filter((index) => index !== null));
    selectedPoint = selectedPoints.size ? Math.min(...selectedPoints) : -1;
    selectedSegment = selectedPoints.size === 1 ? selectedPoint : null;
    if (rect.width <= 0 || rect.height <= 0) selectedPoints.clear();
    syncUI();
}
function addPointAt(point) {
    const nodes = currentPoints();
    const sortedPoint = clamp(point.x, .01, .99);
    const occupied = nodes.some((node) => Math.abs(node.x - sortedPoint) < .025);
    const x = occupied ? clamp(sortedPoint + .035, .01, .99) : sortedPoint;
    let index = nodes.findIndex((node) => node.x > x);
    if (index < 0) index = nodes.length;
    const previous = nodes[index - 1] || nodes[nodes.length - 1];
    const nextNode = nodes[index] || nodes[0];
    const y = point.y ?? ((previous.y + nextNode.y) / 2);
    const inheritedCurve = nodes[index - 1]?.curve ?? nodes[nodes.length - 1]?.curve ?? 1;
    if (nodes[index - 1]) nodes[index - 1].curve = inheritedCurve;
    const next = { x, y, curve: inheritedCurve };
    nodes.splice(index, 0, next);
    selectedPoints = new Set([index]);
    selectedPoint = index;
    selectedSegment = index;
    syncUI(); drawWave(); updateAudioHint();
}
function removePoint(index) {
    if (currentPoints().length <= 3) return;
    currentPoints().splice(index, 1);
    collisionPoints.clear();
    selectedPoints = new Set([...selectedPoints]
        .filter((selectedIndex) => selectedIndex !== index)
        .map((selectedIndex) => selectedIndex > index ? selectedIndex - 1 : selectedIndex));
    selectedPoint = selectedPoints.size ? Math.min(...selectedPoints) : -1;
    selectedSegment = selectedPoints.size === 1 ? selectedPoint : null;
    syncUI(); drawWave(); updateAudioHint();
}
function getSelectionSnapshot() {
    return new Map([...selectedPoints].sort((a, b) => a - b).map((index) => [index, { x: currentPoints()[index].x, y: currentPoints()[index].y }]));
}
function snapX(value) { return clamp(Math.round(value * horizontalGrid) / horizontalGrid, 0, 1); }
function snapY(value) { return clamp(Math.round(((value + 1) / 2) * verticalGrid) / verticalGrid * 2 - 1, -1, 1); }
function applySelectionDelta(snapshot, rawDx, rawDy) {
    if (!snapshot.size) return;
    const points = currentPoints();
    const indices = [...snapshot.keys()].sort((a, b) => a - b);
    const selected = new Set(indices);
    let minDx = -Infinity;
    let maxDx = Infinity;
    let hasMovableX = false;
    indices.forEach((index) => {
        const original = snapshot.get(index);
        if (index === 0) return;
        hasMovableX = true;
        minDx = Math.max(minDx, 0.01 - original.x);
        maxDx = Math.min(maxDx, 0.99 - original.x);
        if (!selected.has(index - 1)) minDx = Math.max(minDx, points[index - 1].x + 0.01 - original.x);
        if (index < points.length - 1 && !selected.has(index + 1)) maxDx = Math.min(maxDx, points[index + 1].x - 0.01 - original.x);
    });
    const dx = hasMovableX ? clamp(rawDx, minDx, maxDx) : 0;
    const minY = Math.max(...indices.map((index) => -1 - snapshot.get(index).y));
    const maxY = Math.min(...indices.map((index) => 1 - snapshot.get(index).y));
    const dy = clamp(rawDy, minY, maxY);
    const targets = new Map();
    indices.forEach((index) => {
        const original = snapshot.get(index);
        let x = index === 0 ? 0 : original.x + dx;
        let y = original.y + dy;
        if (magnetMode) {
            x = index === 0 ? 0 : snapX(x);
            y = snapY(y);
        }
        targets.set(index, { x, y });
    });
    indices.forEach((index) => {
        const target = targets.get(index);
        if (index > 0) {
            const previousX = selected.has(index - 1) ? targets.get(index - 1).x : points[index - 1].x;
            const nextX = index < points.length - 1
                ? selected.has(index + 1) ? targets.get(index + 1).x : points[index + 1].x
                : 1;
            target.x = clamp(target.x, previousX, nextX);
        }
        points[index].x = index === 0 ? 0 : target.x;
        points[index].y = target.y;
    });
    collisionPoints = new Set();
    if (magnetMode) {
        for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) {
                if (Math.abs(points[i].x - points[j].x) < 0.000001) {
                    collisionPoints.add(i); collisionPoints.add(j);
                }
            }
        }
    }
}
function removePointIndices(indices) {
    const unique = [...new Set(indices)].sort((a, b) => a - b);
    if (!unique.length) return 0;
    const removable = Math.min(unique.length, Math.max(0, currentPoints().length - 3));
    const removed = new Set(unique.slice(0, removable));
    const oldSelected = [...selectedPoints];
    [...removed].sort((a, b) => b - a).forEach((index) => currentPoints().splice(index, 1));
    selectedPoints = new Set(oldSelected
        .filter((index) => !removed.has(index))
        .map((index) => index - [...removed].filter((removedIndex) => removedIndex < index).length));
    selectedPoint = selectedPoints.size ? Math.min(...selectedPoints) : -1;
    selectedSegment = selectedPoints.size === 1 ? selectedPoint : null;
    return removed.size;
}
function resolveMagnetCollisions(movedIndices) {
    if (!magnetMode || !collisionPoints.size) return 0;
    const moved = new Set(movedIndices);
    const groups = new Map();
    currentPoints().forEach((point, index) => {
        const key = point.x.toFixed(6);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(index);
    });
    const remove = [];
    groups.forEach((group) => {
        if (group.length < 2) return;
        const keep = group.find((index) => moved.has(index)) ?? group[0];
        group.forEach((index) => { if (index !== keep) remove.push(index); });
    });
    const removedCount = removePointIndices(remove);
    collisionPoints.clear();
    return removedCount;
}
function moveSelectionByKeyboard(dx, dy) {
    if (!selectedPoints.size) return;
    const movedIndices = [...selectedPoints];
    applySelectionDelta(getSelectionSnapshot(), dx, dy);
    const removedCount = resolveMagnetCollisions(movedIndices);
    syncUI();
    drawWave();
    if (removedCount) updateAudioHint();
}
function handleCanvasDown(event) {
    const hit = findHit(event);
    if (!hit) {
        const local = canvasLocalPoint(event);
        selectedPoints.clear();
        selectedPoint = -1;
        selectedSegment = null;
        hoveredSegment = null;
        selectionBox = { startX: local.x, startY: local.y, endX: local.x, endY: local.y };
        drag = { type: "selection" };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "crosshair";
        syncUI(); drawWave(false);
        return;
    }
    if (event.shiftKey && hit.type === "point") { removePoint(hit.index); return; }
    if (hit.type === "segment") {
        if (curveMode !== "spline") return;
        selectedPoints.clear();
        selectedSegment = hit.index;
        selectedPoint = -1;
        hoveredSegment = hit.index;
        selectionBox = null;
        drag = { type: "segment", index: hit.index, startY: event.clientY, startCurve: currentPoints()[hit.index].curve ?? 1 };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "ns-resize";
        syncUI(); drawWave();
        return;
    }
    if (!selectedPoints.has(hit.index)) selectedPoints = new Set([hit.index]);
    selectedPoint = hit.index;
    selectedSegment = hit.index;
    hoveredSegment = null;
    selectionBox = null;
    drag = { type: "move-selection", startX: event.clientX, startY: event.clientY, snapshot: getSelectionSnapshot() };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    syncUI(); drawWave();
}
function handleCanvasMove(event) {
    if (!drag) {
        const hit = findHit(event);
        const nextHoveredSegment = curveMode === "spline" && hit?.type === "segment" ? hit.index : null;
        if (hoveredSegment !== nextHoveredSegment) {
            hoveredSegment = nextHoveredSegment;
            drawWave(false);
        }
        canvas.style.cursor = hit?.type === "segment" ? "ns-resize" : hit?.type === "point" ? "grab" : "default";
        return;
    }
    if (drag.type === "segment") {
        const node = currentPoints()[drag.index];
        if (node) {
            node.curve = clamp(drag.startCurve + (drag.startY - event.clientY) / 120, 0, 1);
            $("curveRange").value = Math.round(node.curve * 100);
            $("curveValue").textContent = `${Math.round(node.curve * 100)}%`;
            drawWave();
        }
        return;
    }
    if (drag.type === "selection") {
        const local = canvasLocalPoint(event);
        selectionBox.endX = local.x;
        selectionBox.endY = local.y;
        updateBoxSelection();
        drawWave(false);
        return;
    }
    if (drag.type === "move-selection") {
        const rect = canvas.getBoundingClientRect();
        const dx = (event.clientX - drag.startX) / rect.width;
        const dy = -(event.clientY - drag.startY) / rect.height * 2;
        applySelectionDelta(drag.snapshot, dx, dy);
        drawWave();
    }
}
function handleCanvasUp(event) {
    let removedCount = 0;
    const movedSelection = drag?.type === "move-selection";
    if (movedSelection) removedCount = resolveMagnetCollisions(drag.snapshot.keys());
    if (drag?.type === "selection") {
        selectionBox = null;
        syncUI();
        drawWave(false);
    }
    if (drag && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = null;
    canvas.style.cursor = hoveredSegment !== null ? "ns-resize" : "default";
    if (movedSelection) {
        syncUI(); drawWave(); updateAudioHint();
    }
}
function handleCanvasLeave() {
    if (drag) return;
    if (hoveredSegment !== null) {
        hoveredSegment = null;
        drawWave(false);
    }
    canvas.style.cursor = "default";
}

function sampleWave(points, sampleCount = getHorizontalResolution(), bitDepth = getVerticalBitDepth()) {
    const result = new Float32Array(sampleCount);
    const spline = curveMode === "spline" ? getSplineModel(points) : null;
    for (let i = 0; i < sampleCount; i += 1) {
        const x = i / sampleCount;
        let segment = points.length - 1;
        for (let j = 0; j < points.length; j += 1) {
            const nextX = j === points.length - 1 ? 1 : points[j + 1].x;
            if (x >= points[j].x && x < nextX) { segment = j; break; }
        }
        const a = points[segment];
        const b = points[(segment + 1) % points.length];
        const endX = segment === points.length - 1 ? 1 : b.x;
        const t = clamp((x - a.x) / Math.max(.0001, endX - a.x), 0, 1);
        const value = curveMode === "linear" ? a.y + (b.y - a.y) * t : evaluateSpline(spline[segment], t);
        const normalized = clamp(value, -1, 1);
        if (bitDepth === null) {
            result[i] = normalized;
        } else {
            const peak = bitDepth === 32 ? 2147483647 : 2 ** (bitDepth - 1) - 1;
            result[i] = Math.round(normalized * peak) / peak;
        }
    }
    return result;
}
function getWaveformPeak(values) {
    let peak = 0;
    values.forEach((value) => { peak = Math.max(peak, Math.abs(value)); });
    return peak;
}
async function ensureTableWorklet(context) {
    if (!context.audioWorklet) throw new Error("AudioWorklet is not supported");
    if (!tableWorkletReady) {
        const workletSource = `
            class WavetableProcessor extends AudioWorkletProcessor {
                constructor(options) {
                    super();
                    const initialTable = options.processorOptions.table || [];
                    this.table = new Float32Array(initialTable);
                    this.frequency = options.processorOptions.frequency || 440;
                    this.phase = 0;
                    this.active = true;
                    this.port.onmessage = (event) => {
                        const message = event.data || {};
                        if (message.type === "table") this.table = new Float32Array(message.table);
                        if (message.type === "frequency") this.frequency = message.frequency;
                        if (message.type === "stop") this.active = false;
                    };
                }

                process(inputs, outputs) {
                    const channel = outputs[0] && outputs[0][0];
                    if (!channel) return this.active;
                    if (!this.active || !this.table.length) {
                        channel.fill(0);
                        return this.active;
                    }

                    const tableLength = this.table.length;
                    const step = this.frequency * tableLength / sampleRate;
                    for (let i = 0; i < channel.length; i += 1) {
                        // Deliberately use the nearest table entry. No interpolation.
                        channel[i] = this.table[Math.floor(this.phase) % tableLength];
                        this.phase += step;
                        while (this.phase >= tableLength) this.phase -= tableLength;
                    }
                    return this.active;
                }
            }
            registerProcessor("wavetable-reader", WavetableProcessor);
        `;
        tableWorkletUrl = URL.createObjectURL(new Blob([workletSource], { type: "application/javascript" }));
        tableWorkletReady = context.audioWorklet.addModule(tableWorkletUrl);
    }
    await tableWorkletReady;
}
async function createTableSource(context, frequency, table) {
    await ensureTableWorklet(context);
    const node = new AudioWorkletNode(context, "wavetable-reader", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { frequency, table: Array.from(table) },
    });
    return {
        node,
        setTable(nextTable) {
            node.port.postMessage({ type: "table", table: Array.from(nextTable) });
        },
        stop() {
            node.port.postMessage({ type: "stop" });
            node.disconnect();
        },
    };
}
function updateActiveWaveforms() {
    if (!audioContext || !activeVoices.size) return;
    const table = sampleWave(currentPoints());
    activeVoices.forEach((voice) => {
        voice.table = table;
        voice.tableSource.setTable(table);
    });
}
function getKnobControl(name) {
    return document.querySelector(`[data-knob="${name}"]`);
}
function formatKnobValue(control, value) {
    const unit = control.dataset.unit;
    if (unit === "percent") return `${Math.round(value * 100)}%`;
    if (unit === "s") return `${value.toFixed(2)} s`;
    if (unit === "hz") return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`;
    if (unit === "samples") return `${Math.round(value)} samples`;
    if (unit === "bits") return `${Math.round(value)} bit`;
    return value.toFixed(1);
}
function setKnobValue(control, rawValue) {
    const min = Number(control.dataset.min);
    const max = Number(control.dataset.max);
    const step = Number(control.dataset.step);
    const options = control.dataset.options ? control.dataset.options.split(",").map(Number) : null;
    const value = options
        ? options.reduce((closest, option) => Math.abs(option - rawValue) < Math.abs(closest - rawValue) ? option : closest, options[0])
        : clamp(Math.round(rawValue / step) * step, min, max);
    control.dataset.value = String(value);
    control.querySelector(".knob-output").textContent = formatKnobValue(control, value);
    const ratio = options
        ? options.indexOf(value) / Math.max(1, options.length - 1)
        : (value - min) / (max - min);
    control.querySelector(".knob-indicator").style.transform = `translateX(-50%) rotate(${-135 + ratio * 270}deg)`;
    const button = control.querySelector(".knob");
    button.setAttribute("aria-valuemin", min);
    button.setAttribute("aria-valuemax", max);
    button.setAttribute("aria-valuenow", value);
    button.setAttribute("aria-valuetext", formatKnobValue(control, value));
}
function adjustKnob(control, direction) {
    const options = control.dataset.options ? control.dataset.options.split(",").map(Number) : null;
    const current = Number(control.dataset.value);
    if (options) {
        const index = options.reduce((closest, option, optionIndex) => Math.abs(option - current) < Math.abs(options[closest] - current) ? optionIndex : closest, 0);
        setKnobValue(control, options[clamp(index + direction, 0, options.length - 1)]);
    } else {
        setKnobValue(control, current + Number(control.dataset.step) * direction);
    }
}
function updateExportAvailability() {
    const exportButton = $("exportButton");
    const enabled = getVerticalBitDepth() >= 8;
    exportButton.disabled = !enabled;
    exportButton.setAttribute("aria-disabled", String(!enabled));
    exportButton.title = enabled ? "現在の波形をWAVとして書き出す" : "4〜7bitはテスト用のためWAV書き出しできません";
    if (!enabled) {
        $("statusText").textContent = "4〜7bitテストモード：WAV書き出し不可";
    }
}
function handleKnobChange(control) {
    if (control.dataset.knob === "horizontal" || control.dataset.knob === "vertical") {
        drawWave();
    }
    if (control.dataset.knob === "vertical") {
        updateExportAvailability();
    }
    if (control.dataset.knob === "cutoff" || control.dataset.knob === "resonance") {
        updateActiveFilters();
    }
}
function setupKnobs() {
    document.querySelectorAll(".knob-control").forEach((control) => {
        const button = control.querySelector(".knob");
        setKnobValue(control, Number(control.dataset.value));
        let dragStart = null;
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            dragStart = { y: event.clientY, value: Number(control.dataset.value) };
            button.setPointerCapture(event.pointerId);
            button.classList.add("is-dragging");
        });
        button.addEventListener("pointermove", (event) => {
            if (!dragStart) return;
            const options = control.dataset.options ? control.dataset.options.split(",").map(Number) : null;
            if (options) {
                const startIndex = options.reduce((closest, option, index) => Math.abs(option - dragStart.value) < Math.abs(options[closest] - dragStart.value) ? index : closest, 0);
                const pixelsPerOption = 140 / Math.max(1, options.length - 1);
                const nextIndex = Math.round(startIndex + (dragStart.y - event.clientY) / pixelsPerOption);
                setKnobValue(control, options[clamp(nextIndex, 0, options.length - 1)]);
            } else {
                const range = Number(control.dataset.max) - Number(control.dataset.min);
                setKnobValue(control, dragStart.value + (dragStart.y - event.clientY) / 140 * range);
            }
            handleKnobChange(control);
        });
        const finishDrag = (event) => {
            if (!dragStart) return;
            if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
            dragStart = null;
            button.classList.remove("is-dragging");
        };
        button.addEventListener("pointerup", finishDrag);
        button.addEventListener("pointercancel", finishDrag);
        button.addEventListener("keydown", (event) => {
            const min = Number(control.dataset.min);
            const max = Number(control.dataset.max);
            if (event.key === "ArrowUp" || event.key === "ArrowRight") { event.preventDefault(); adjustKnob(control, 1); handleKnobChange(control); }
            if (event.key === "ArrowDown" || event.key === "ArrowLeft") { event.preventDefault(); adjustKnob(control, -1); handleKnobChange(control); }
            if (event.key === "Home") { event.preventDefault(); setKnobValue(control, min); handleKnobChange(control); }
            if (event.key === "End") { event.preventDefault(); setKnobValue(control, max); handleKnobChange(control); }
        });
    });
}
function getSettings() {
    return {
        attack: Number(getKnobControl("attack").dataset.value), decay: Number(getKnobControl("decay").dataset.value),
        sustain: Number(getKnobControl("sustain").dataset.value), release: Number(getKnobControl("release").dataset.value),
        cutoff: Number(getKnobControl("cutoff").dataset.value), resonance: Number(getKnobControl("resonance").dataset.value),
    };
}
function updateActiveFilters() {
    if (!audioContext || !activeVoices.size) return;
    const now = audioContext.currentTime;
    const settings = getSettings();
    const filterType = $("filterTypeSelect").value;
    activeVoices.forEach((voice) => {
        voice.filter.type = filterType;
        voice.filter.frequency.cancelScheduledValues(now);
        voice.filter.frequency.setTargetAtTime(Math.min(settings.cutoff, audioContext.sampleRate / 2 - 1), now, 0.012);
        voice.filter.Q.cancelScheduledValues(now);
        voice.filter.Q.setTargetAtTime(settings.resonance, now, 0.012);
        voice.settings.cutoff = settings.cutoff;
        voice.settings.resonance = settings.resonance;
    });
}
async function ensureAudio() { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === "suspended") await audioContext.resume(); return audioContext; }
async function startVoice(note, keyElement) {
    const context = await ensureAudio();
    const table = sampleWave(currentPoints());
    if (getWaveformPeak(table) < 0.000001) {
        $("statusText").textContent = "波形が直線のため無音です";
        return;
    }
    const now = context.currentTime;
    const settings = getSettings();
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
    let tableSource;
    try {
        tableSource = await createTableSource(context, frequency, table);
    } catch (error) {
        console.error(error);
        $("statusText").textContent = "AudioWorkletを初期化できません。localhostまたはHTTPSで開いてください";
        return;
    }
    const filter = context.createBiquadFilter();
    filter.type = $("filterTypeSelect").value; filter.frequency.value = Math.min(settings.cutoff, context.sampleRate / 2 - 1); filter.Q.value = settings.resonance;
    const gain = context.createGain(); gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(.22, now + settings.attack);
    gain.gain.linearRampToValueAtTime(.22 * settings.sustain, now + settings.attack + settings.decay);
    tableSource.node.connect(filter).connect(gain).connect(context.destination);
    const voice = { tableSource, table, filter, gain, settings, keyElement, frequency };
    activeVoices.set(note.key, voice); keyElement.classList.add("active"); $("statusDot").classList.add("is-playing"); $("statusText").textContent = `${note.note}${Math.floor(note.midi / 12) - 1} を発音中`;
}
function stopVoice(note) {
    const voice = activeVoices.get(note.key); if (!voice || !audioContext) return;
    const now = audioContext.currentTime; const release = voice.settings.release;
    voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(Math.max(.0001, voice.gain.gain.value), now); voice.gain.gain.exponentialRampToValueAtTime(.0001, now + release);
    window.setTimeout(() => voice.tableSource.stop(), (release + .04) * 1000); voice.keyElement.classList.remove("active"); activeVoices.delete(note.key);
    if (!activeVoices.size) { $("statusDot").classList.remove("is-playing"); $("statusText").textContent = "クリックまたはキー入力で発音"; }
}

function renderKeyboard() {
    const keyboard = $("keyboard"); keyboard.innerHTML = "";
    NOTE_KEYS.forEach((note) => {
        const key = document.createElement("button"); key.type = "button"; key.className = `key${note.black ? " black" : ""}`;
        key.dataset.key = note.key; key.innerHTML = `<span class="key-note">${note.note}</span><span class="key-label">${note.key.toUpperCase()}</span>`;
        key.addEventListener("pointerdown", (event) => { event.preventDefault(); startVoice({ ...note, midi: note.midi + (octave - 4) * 12 }, key); });
        key.addEventListener("pointerup", () => stopVoice(note)); key.addEventListener("pointerleave", () => { if (activeVoices.has(note.key)) stopVoice(note); });
        keyboard.appendChild(key);
    });
}
function syncUI() {
    $("octaveLabel").textContent = `OCT ${octave}`;
    const points = currentPoints();
    if (selectedSegment !== null) selectedSegment = clamp(selectedSegment, 0, points.length - 1);
    const hasCurveSelection = selectedSegment !== null && selectedPoints.size <= 1;
    const curve = Math.round((points[selectedSegment]?.curve ?? 1) * 100);
    $("curveRange").disabled = !hasCurveSelection;
    $("curveRange").value = curve;
    $("curveValue").textContent = `${curve}%`;
    $("selectionLabel").textContent = selectedPoints.size > 1
        ? `${selectedPoints.size}点を選択中`
        : selectedPoints.size === 1
            ? `選択点 ${selectedPoint + 1} / ${points.length}`
            : selectedSegment !== null
                ? `選択線 ${selectedSegment + 1} / ${points.length}`
                : "選択なし";
}
function updateAudioHint() { $("statusText").textContent = "波形を更新しました。鍵盤で試聴できます"; }
function updateMagnetUI() {
    const button = $("magnetButton");
    button.textContent = magnetMode ? "マグネット：ON" : "マグネット：OFF";
    button.classList.toggle("is-active", magnetMode);
    button.setAttribute("aria-pressed", String(magnetMode));
}
function setGridValue(axis, rawValue) {
    const value = clamp(Math.round(Number(rawValue) || 8), 4, 64);
    if (axis === "horizontal") {
        horizontalGrid = value;
        $("horizontalGridInput").value = value;
    } else {
        verticalGrid = value;
        $("verticalGridInput").value = value;
    }
    drawWave(false);
}
function presetPoints(name) {
    const values = presets[name];
    const smooth = name === "sine" || name === "pluck";
    const points = makePoints(values);
    const xPositions = name === "square"
        ? [0, .49, .51, .99]
        : name === "saw"
            ? values.map((_, index) => index / (values.length - 1) * .99)
            : values.map((_, index) => index / values.length);
    return points.map((point, index) => ({ x: xPositions[index], y: point.y, curve: smooth ? 1 : 0 }));
}
function normalizeWaveform() {
    const peak = Math.max(...currentPoints().map((point) => Math.abs(point.y)));
    if (peak < 0.000001) {
        $("statusText").textContent = "波形が中心線上のためノーマライズできません";
        return;
    }
    currentPoints().forEach((point) => { point.y = clamp(point.y / peak, -1, 1); });
    syncUI();
    drawWave();
    updateAudioHint();
}
function setPreset(name) { waveformPoints = presetPoints(name); collisionPoints.clear(); selectedPoints = new Set([1]); selectedPoint = 1; selectedSegment = 1; syncUI(); drawWave(); updateAudioHint(); }

function encodeWav(samples, sampleRate, bitDepth) {
    const bytesPerSample = bitDepth === 32 ? 4 : bitDepth === 24 ? 3 : bitDepth === 8 ? 1 : 2;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample); const view = new DataView(buffer);
    const write = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    write(0, "RIFF"); view.setUint32(4, 36 + samples.length * bytesPerSample, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, bitDepth === 32 ? 3 : 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * bytesPerSample, true); view.setUint16(32, bytesPerSample, true); view.setUint16(34, bitDepth, true); write(36, "data"); view.setUint32(40, samples.length * bytesPerSample, true);
    let offset = 44; samples.forEach((sample) => { const value = clamp(sample, -1, 1); if (bitDepth === 32) view.setFloat32(offset, value, true); else if (bitDepth === 24) { const n = Math.round(value < 0 ? value * 8388608 : value * 8388607); view.setUint8(offset, n & 255); view.setUint8(offset + 1, (n >> 8) & 255); view.setUint8(offset + 2, (n >> 16) & 255); } else if (bitDepth === 8) view.setUint8(offset, Math.round((value + 1) * 127.5)); else view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true); offset += bytesPerSample; });
    return new Blob([buffer], { type: "audio/wav" });
}
async function exportWav() {
    const sampleRate = 44100;
    const samples = sampleWave(currentPoints());
    const bitDepth = getVerticalBitDepth();
    if (bitDepth < 8) {
        updateExportAvailability();
        return;
    }
    const blob = encodeWav(samples, sampleRate, bitDepth);
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `curvetable-${bitDepth}bit.wav`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    $("statusText").textContent = "1周期分のWAVを書き出しました";
}
function exportWt8() {
    const normalizedSamples = sampleWave(currentPoints(), 256, null);
    const bytes = new Uint8Array(256);
    normalizedSamples.forEach((sample, index) => {
        const signedQ7 = clamp(Math.round(sample * 127), -127, 127);
        bytes[index] = signedQ7 < 0 ? signedQ7 + 256 : signedQ7;
    });
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "waveform.wt8";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    $("statusText").textContent = "256バイトのWT8を書き出しました";
}

function bindEvents() {
    setupKnobs();
    updateExportAvailability();
    canvas.addEventListener("pointerdown", handleCanvasDown); canvas.addEventListener("pointermove", handleCanvasMove); canvas.addEventListener("pointerup", handleCanvasUp); canvas.addEventListener("pointercancel", handleCanvasUp); canvas.addEventListener("pointerleave", handleCanvasLeave);
    canvas.addEventListener("dblclick", (event) => addPointAt(canvasToPoint(event)));
    $("presetSelect").addEventListener("change", (event) => setPreset(event.target.value)); $("resetButton").addEventListener("click", resetWaveform);
    $("addPointButton").addEventListener("click", () => addPointAt({ x: .5, y: 0 }));
    $("curveRange").addEventListener("input", (event) => {
        const point = currentPoints()[selectedSegment];
        if (!point) return;
        point.curve = Number(event.target.value) / 100;
        $("curveValue").textContent = `${event.target.value}%`;
        drawWave();
    });
    $("normalizeButton").addEventListener("click", normalizeWaveform);
    updateMagnetUI();
    $("magnetButton").addEventListener("click", () => {
        magnetMode = !magnetMode;
        collisionPoints.clear();
        updateMagnetUI();
        drawWave(false);
    });
    $("horizontalGridInput").addEventListener("change", (event) => setGridValue("horizontal", event.target.value));
    $("verticalGridInput").addEventListener("change", (event) => setGridValue("vertical", event.target.value));
    $("octaveDown").addEventListener("click", () => { octave = clamp(octave - 1, 1, 7); syncUI(); renderKeyboard(); }); $("octaveUp").addEventListener("click", () => { octave = clamp(octave + 1, 1, 7); syncUI(); renderKeyboard(); });
    $("filterTypeSelect").addEventListener("change", updateActiveFilters);
    $("exportButton").addEventListener("click", exportWav); $("exportWt8Button").addEventListener("click", exportWt8); window.addEventListener("resize", resizeCanvas);
    document.addEventListener("keydown", (event) => {
        if (event.target.matches("input, select, textarea")) return;
        const step = event.shiftKey ? .02 : .005;
        const arrowMoves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (selectedPoints.size && arrowMoves[event.key]) {
            event.preventDefault();
            moveSelectionByKeyboard(...arrowMoves[event.key]);
            return;
        }
        if (event.repeat) return;
        const note = NOTE_KEYS.find((item) => item.key === event.key.toLowerCase());
        if (note) {
            const key = document.querySelector(`[data-key="${note.key}"]`);
            startVoice({ ...note, midi: note.midi + (octave - 4) * 12 }, key);
        }
    });
    document.addEventListener("keyup", (event) => { const note = NOTE_KEYS.find((item) => item.key === event.key.toLowerCase()); if (note) stopVoice(note); });
}

resetWaveform(); renderKeyboard(); bindEvents(); requestAnimationFrame(resizeCanvas);
