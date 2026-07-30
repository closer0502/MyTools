"use strict";

const TPQN = 480;
const SVP_BLICKS_PER_QUARTER = 705600000;
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const STEP_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const TRACK_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#f59e0b", "#fb7185", "#22d3ee"];
const VOCAL_NAME_PATTERN = /(vocal|voice|vox|melody|singer|soprano|alto|tenor|bass|choir|chorus|歌|唄|主旋律|メロディ|ソプラノ|アルト|テノール|バス|合唱)/i;
const PERCUSSION_NAME_PATTERN = /(drum|percussion|打楽器|ドラム|パーカッション)/i;
const MAX_MXL_BYTES = 50 * 1024 * 1024;
const MAX_XML_CHARACTERS = 60 * 1024 * 1024;

const refs = {
    musicXmlTab: document.getElementById("musicXmlTab"),
    svpTab: document.getElementById("svpTab"),
    musicXmlPanel: document.getElementById("musicXmlPanel"),
    svpPanel: document.getElementById("svpPanel"),
    dropZone: document.getElementById("dropZone"),
    fileInput: document.getElementById("fileInput"),
    fileButton: document.getElementById("fileButton"),
    sampleButton: document.getElementById("sampleButton"),
    svpDropZone: document.getElementById("svpDropZone"),
    svpFileInput: document.getElementById("svpFileInput"),
    svpFileButton: document.getElementById("svpFileButton"),
    svpSampleButton: document.getElementById("svpSampleButton"),
    fileSummary: document.getElementById("fileSummary"),
    fileName: document.getElementById("fileName"),
    scoreTitle: document.getElementById("scoreTitle"),
    partCount: document.getElementById("partCount"),
    measureCount: document.getElementById("measureCount"),
    lyricCount: document.getElementById("lyricCount"),
    errorMessage: document.getElementById("errorMessage"),
    conversionArea: document.getElementById("conversionArea"),
    partsList: document.getElementById("partsList"),
    partsTitle: document.getElementById("partsTitle"),
    selectionHint: document.getElementById("selectionHint"),
    transposeInput: document.getElementById("transposeInput"),
    defaultLyricInput: document.getElementById("defaultLyricInput"),
    chordPolicySelect: document.getElementById("chordPolicySelect"),
    defaultTempoInput: document.getElementById("defaultTempoInput"),
    repeatOptionRow: document.getElementById("repeatOptionRow"),
    expandRepeatsInput: document.getElementById("expandRepeatsInput"),
    mergeTiesInput: document.getElementById("mergeTiesInput"),
    trimOverlapsInput: document.getElementById("trimOverlapsInput"),
    previewTrackCount: document.getElementById("previewTrackCount"),
    previewNoteCount: document.getElementById("previewNoteCount"),
    previewTempoCount: document.getElementById("previewTempoCount"),
    pianoRoll: document.getElementById("pianoRoll"),
    emptyPreview: document.getElementById("emptyPreview"),
    notesBody: document.getElementById("notesBody"),
    tableNote: document.getElementById("tableNote"),
    warningsList: document.getElementById("warningsList"),
    lyricsTrackSelect: document.getElementById("lyricsTrackSelect"),
    lyricsSeparatorSelect: document.getElementById("lyricsSeparatorSelect"),
    copyLyricsButton: document.getElementById("copyLyricsButton"),
    lyricsOutput: document.getElementById("lyricsOutput"),
    lyricsCount: document.getElementById("lyricsCount"),
    lyricsCopyStatus: document.getElementById("lyricsCopyStatus"),
    exportDescription: document.getElementById("exportDescription"),
    exportButton: document.getElementById("exportButton")
};

const state = {
    inputMode: "musicxml",
    sessions: {
        musicxml: null,
        svp: null
    },
    score: null,
    fileName: "",
    preview: null
};

function directChildren(node, localName) {
    return Array.from(node?.children || []).filter(child => child.localName === localName);
}

function firstChild(node, localName) {
    return directChildren(node, localName)[0] || null;
}

function descendants(node, localName) {
    return Array.from(node?.getElementsByTagName("*") || []).filter(child => child.localName === localName);
}

function childText(node, localName, fallback = "") {
    const child = firstChild(node, localName);
    return child ? child.textContent.trim() : fallback;
}

function descendantText(node, localName, fallback = "") {
    const child = descendants(node, localName)[0];
    return child ? child.textContent.trim() : fallback;
}

function numberValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function parseMusicXML(source, fileName) {
    const doctypeResult = stripXmlDoctype(source);
    source = doctypeResult.source;

    const documentNode = new DOMParser().parseFromString(source, "application/xml");
    const parserError = descendants(documentNode, "parsererror")[0];
    if (parserError) {
        const detail = parserError.textContent.replace(/\s+/g, " ").trim();
        throw new Error(`XMLを解析できませんでした。${detail.slice(0, 180)}`);
    }

    const root = documentNode.documentElement;
    if (!root || root.localName !== "score-partwise") {
        if (root?.localName === "score-timewise") {
            throw new Error("score-timewise形式にはまだ対応していません。score-partwise形式で書き出してください。");
        }
        throw new Error("MusicXMLのscore-partwise文書ではありません。");
    }

    const title =
        descendantText(root, "work-title") ||
        childText(root, "movement-title") ||
        descendantText(root, "credit-words") ||
        fileName.replace(/\.(musicxml|xml)$/i, "");

    const definitions = new Map();
    const partList = firstChild(root, "part-list");
    directChildren(partList, "score-part").forEach(definition => {
        const id = definition.getAttribute("id") || "";
        const instrumentNames = descendants(definition, "instrument-name").map(node => node.textContent.trim()).filter(Boolean);
        const instrumentSounds = descendants(definition, "instrument-sound").map(node => node.textContent.trim()).filter(Boolean);
        definitions.set(id, {
            name: childText(definition, "part-name", id || "名称未設定"),
            abbreviation: childText(definition, "part-abbreviation"),
            instrumentNames,
            instrumentSounds
        });
    });

    const parts = directChildren(root, "part").map((partNode, index) => {
        const id = partNode.getAttribute("id") || `P${index + 1}`;
        const definition = definitions.get(id) || {
            name: id,
            abbreviation: "",
            instrumentNames: [],
            instrumentSounds: []
        };
        return analyzePart(partNode, id, definition, index);
    });

    if (!parts.length) {
        throw new Error("変換できるパートが見つかりませんでした。");
    }

    const ranked = [...parts].sort((a, b) => b.candidateScore - a.candidateScore);
    const best = ranked[0];
    parts.forEach(part => {
        part.selected = part.id === best.id;
        part.recommended = part.id === best.id && (part.lyricCount > 0 || part.nameMatched);
        part.selectedVoice = chooseBestVoice(part);
    });

    return {
        sourceType: "musicxml",
        documentNode,
        root,
        title,
        parts,
        totalLyrics: parts.reduce((sum, part) => sum + part.lyricCount, 0),
        measureCount: Math.max(...parts.map(part => part.measureCount), 0),
        fileName,
        loadWarnings: doctypeResult.removed
            ? ["MusicXMLのDOCTYPE宣言を安全に除去して読み込みました。楽譜データへの影響はありません。"]
            : []
    };
}

function stripXmlDoctype(source) {
    const start = source.search(/<!DOCTYPE/i);
    if (start < 0) {
        return { source, removed: false };
    }

    let quote = "";
    let internalSubsetDepth = 0;
    for (let index = start + 9; index < source.length; index += 1) {
        const character = source[index];
        if (quote) {
            if (character === quote) quote = "";
            continue;
        }
        if (character === "\"" || character === "'") {
            quote = character;
            continue;
        }
        if (character === "[") {
            internalSubsetDepth += 1;
            continue;
        }
        if (character === "]" && internalSubsetDepth > 0) {
            internalSubsetDepth -= 1;
            continue;
        }
        if (character === ">" && internalSubsetDepth === 0) {
            return {
                source: source.slice(0, start) + source.slice(index + 1),
                removed: true
            };
        }
    }
    throw new Error("MusicXMLのDOCTYPE宣言が途中で途切れています。MuseScoreからもう一度書き出してください。");
}

function analyzePart(partNode, id, definition, index) {
    const notes = descendants(partNode, "note");
    const pitchedNotes = notes.filter(note => firstChild(note, "pitch") && !firstChild(note, "grace"));
    const lyricCount = pitchedNotes.filter(note => directChildren(note, "lyric").some(lyric => childText(lyric, "text"))).length;
    const chordCount = pitchedNotes.filter(note => firstChild(note, "chord")).length;
    const voices = new Map();
    const staves = new Set();
    let minPitch = Infinity;
    let maxPitch = -Infinity;

    pitchedNotes.forEach(note => {
        const voice = childText(note, "voice", "1");
        const voiceData = voices.get(voice) || { id: voice, noteCount: 0, lyricCount: 0 };
        voiceData.noteCount += 1;
        if (directChildren(note, "lyric").some(lyric => childText(lyric, "text"))) {
            voiceData.lyricCount += 1;
        }
        voices.set(voice, voiceData);
        staves.add(childText(note, "staff", "1"));
        const pitch = musicXmlPitchToMidi(note);
        if (pitch !== null) {
            minPitch = Math.min(minPitch, pitch);
            maxPitch = Math.max(maxPitch, pitch);
        }
    });

    const searchableName = [
        definition.name,
        definition.abbreviation,
        ...definition.instrumentNames,
        ...definition.instrumentSounds
    ].join(" ");
    const nameMatched = VOCAL_NAME_PATTERN.test(searchableName);
    const isPercussion = PERCUSSION_NAME_PATTERN.test(searchableName) ||
        notes.some(note => firstChild(note, "unpitched"));
    const polyphonyPenalty = pitchedNotes.length ? chordCount / pitchedNotes.length : 0;
    const candidateScore =
        lyricCount * 1000 +
        (nameMatched ? 500 : 0) +
        Math.min(pitchedNotes.length, 300) -
        Math.round(polyphonyPenalty * 220) -
        (isPercussion ? 1000 : 0);

    return {
        node: partNode,
        id,
        index,
        name: definition.name || id,
        instrument: definition.instrumentNames[0] || definition.instrumentSounds[0] || "",
        measureCount: directChildren(partNode, "measure").length,
        noteCount: pitchedNotes.length,
        lyricCount,
        chordCount,
        voices: [...voices.values()].sort(compareVoiceIds),
        staves: [...staves],
        minPitch: Number.isFinite(minPitch) ? minPitch : null,
        maxPitch: Number.isFinite(maxPitch) ? maxPitch : null,
        nameMatched,
        isPercussion,
        candidateScore,
        selected: false,
        recommended: false,
        selectedVoice: "1"
    };
}

function compareVoiceIds(a, b) {
    return a.id.localeCompare(b.id, "ja", { numeric: true });
}

function chooseBestVoice(part) {
    const sorted = [...part.voices].sort((a, b) => {
        if (b.lyricCount !== a.lyricCount) return b.lyricCount - a.lyricCount;
        return b.noteCount - a.noteCount;
    });
    return sorted[0]?.id || "1";
}

function musicXmlPitchToMidi(note) {
    const pitch = firstChild(note, "pitch");
    if (!pitch) return null;
    const step = childText(pitch, "step").toUpperCase();
    const octave = numberValue(childText(pitch, "octave"), NaN);
    const alter = numberValue(childText(pitch, "alter"), 0);
    if (!(step in STEP_TO_SEMITONE) || !Number.isFinite(octave)) return null;
    return (octave + 1) * 12 + STEP_TO_SEMITONE[step] + alter;
}

function renderScore() {
    const score = state.score;
    refs.fileName.textContent = state.fileName;
    refs.scoreTitle.textContent = score.title;
    refs.partCount.textContent = String(score.parts.length);
    refs.measureCount.textContent = String(score.measureCount);
    refs.lyricCount.textContent = String(score.totalLyrics);
    refs.fileSummary.hidden = false;
    refs.conversionArea.hidden = false;
    refs.errorMessage.hidden = true;
    refs.partsList.replaceChildren(...score.parts.map(createPartRow));

    const isSvp = score.sourceType === "svp";
    refs.partsTitle.textContent = isSvp ? "変換するSVPトラック" : "ボーカルとして使うパート";
    refs.repeatOptionRow.hidden = isSvp;
    if (isSvp) {
        refs.selectionHint.textContent = "歌詞付き音符の多いトラックを選びました。複数トラックも選択できます。";
    } else if (score.totalLyrics > 0) {
        refs.selectionHint.textContent = "歌詞付き音符を優先して候補を選びました。必要なら変更できます。";
    } else {
        refs.selectionHint.textContent = "歌詞が見つからないため、パート名と音符数から候補を選びました。";
    }

    setCurrentStep(2);
    updatePreview();
}

function createPartRow(part) {
    const row = document.createElement("div");
    row.className = `part-row${part.selected ? " is-selected" : ""}`;
    row.dataset.partId = part.id;

    const choice = document.createElement("label");
    choice.className = "part-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = part.selected;
    checkbox.dataset.role = "part-toggle";
    checkbox.setAttribute("aria-label", `${part.name}を変換`);

    const title = document.createElement("span");
    title.className = "part-title";
    const strong = document.createElement("strong");
    strong.textContent = part.name;
    if (part.recommended) {
        const badge = document.createElement("span");
        badge.className = "candidate-badge";
        badge.textContent = "おすすめ";
        strong.append(badge);
    }
    const sub = document.createElement("span");
    sub.textContent = `${part.id}${part.instrument ? ` · ${part.instrument}` : ""}`;
    title.append(strong, sub);
    choice.append(checkbox, title);

    const voiceSelect = document.createElement("select");
    voiceSelect.dataset.role = "voice-select";
    voiceSelect.disabled = !part.selected;
    voiceSelect.setAttribute("aria-label", `${part.name}のVoice`);
    part.voices.forEach(voice => {
        const option = document.createElement("option");
        option.value = voice.id;
        option.selected = voice.id === part.selectedVoice;
        option.textContent = `${voice.label || `Voice ${voice.id}`} · ${voice.noteCount}音${voice.lyricCount ? ` · 歌詞${voice.lyricCount}` : ""}`;
        voiceSelect.append(option);
    });
    if (!part.voices.length) {
        const option = document.createElement("option");
        option.value = "1";
        option.textContent = "Voice 1";
        voiceSelect.append(option);
    }

    row.append(
        choice,
        voiceSelect,
        createPartStat("歌詞", `${part.lyricCount}音`),
        createPartStat("音符", `${part.noteCount}音`),
        createPartStat("音域", formatPitchRange(part))
    );

    checkbox.addEventListener("change", () => {
        part.selected = checkbox.checked;
        row.classList.toggle("is-selected", part.selected);
        voiceSelect.disabled = !part.selected;
        updatePreview();
    });
    voiceSelect.addEventListener("change", () => {
        part.selectedVoice = voiceSelect.value;
        updatePreview();
    });

    return row;
}

function createPartStat(label, value) {
    const cell = document.createElement("span");
    cell.className = "part-stat";
    const caption = document.createElement("span");
    caption.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    cell.append(caption, strong);
    return cell;
}

function formatPitchRange(part) {
    if (part.minPitch === null || part.maxPitch === null) return "-";
    return `${midiToNoteName(part.minPitch)}–${midiToNoteName(part.maxPitch)}`;
}

function getOptions() {
    return {
        transpose: clamp(Math.round(numberValue(refs.transposeInput.value)), -48, 48),
        defaultLyric: refs.defaultLyricInput.value.trim() || "あ",
        chordPolicy: refs.chordPolicySelect.value,
        defaultTempo: clamp(numberValue(refs.defaultTempoInput.value, 120), 20, 400),
        expandRepeats: refs.expandRepeatsInput.checked,
        mergeTies: refs.mergeTiesInput.checked,
        trimOverlaps: refs.trimOverlapsInput.checked
    };
}

function buildPreview() {
    const options = getOptions();
    const selectedParts = state.score.parts.filter(part => part.selected);
    if (!selectedParts.length) {
        return {
            tracks: [],
            tempos: [{ tick: 0, bpm: options.defaultTempo }],
            timeSignatures: [{ measure: 0, numerator: 4, denominator: 4 }],
            warnings: [],
            totalTick: 0,
            options
        };
    }

    const isSvp = state.score.sourceType === "svp";
    const parsedTracks = isSvp
        ? selectedParts.map(part => parseSvpTrack(part, options))
        : selectedParts.map(part => parsePartTimeline(part, part.selectedVoice, options));
    let allMasterTempos;
    let allMasterTimeSignatures;

    if (isSvp) {
        allMasterTempos = state.score.tempos;
        allMasterTimeSignatures = state.score.timeSignatures;
    } else {
        const firstScorePart = state.score.parts[0];
        const masterSource = parsedTracks.find(track => track.id === firstScorePart.id) ||
            parsePartTimeline(firstScorePart, chooseBestVoice(firstScorePart), options);
        allMasterTempos = [
            ...masterSource.tempos,
            ...parsedTracks.flatMap(track => track.tempos)
        ];
        allMasterTimeSignatures = [
            ...masterSource.timeSignatures,
            ...parsedTracks.flatMap(track => track.timeSignatures)
        ];
    }
    const warnings = [];
    parsedTracks.forEach(track => warnings.push(...track.warnings));

    if (parsedTracks.some(track => track.notes.some(note => note.generatedPhoneme))) {
        warnings.push("発音記号は仮の「a」で出力します。VOCALOIDで歌手を選び、必要に応じて歌詞を再入力してください。");
    }
    warnings.push("出力後、VOCALOID側で使用するボイスバンクを選択してください。");

    return {
        tracks: parsedTracks,
        tempos: normalizeTempoEvents(allMasterTempos, options.defaultTempo),
        timeSignatures: normalizeTimeSignatures(allMasterTimeSignatures),
        warnings: [...new Set([...(state.score.loadWarnings || []), ...warnings])],
        totalTick: Math.max(...parsedTracks.map(track => track.totalTick), 0),
        options
    };
}

function parseSvpTrack(part, options) {
    const warnings = [...(part.importWarnings || [])];
    let notes = part.svpNotes.map((note, sourceOrder) => ({
        tick: Math.max(0, Math.round(note.tick)),
        duration: Math.max(1, Math.round(note.duration)),
        noteNumber: clamp(Math.round(note.noteNumber + options.transpose), 0, 127),
        lyric: normalizeSvpLyric(note.lyric, options.defaultLyric),
        usedDefaultLyric: !String(note.lyric || "").trim(),
        generatedPhoneme: true,
        sourceOrder
    }));

    notes = applyChordPolicy(notes, options.chordPolicy, part, warnings);
    notes.sort((a, b) => a.tick - b.tick || a.noteNumber - b.noteNumber || a.sourceOrder - b.sourceOrder);
    if (options.trimOverlaps) {
        notes = trimNoteOverlaps(notes, part, warnings);
    }

    const defaultLyricCount = notes.filter(note => note.usedDefaultLyric).length;
    if (defaultLyricCount) {
        warnings.push(`${part.name}: 歌詞がない${defaultLyricCount}音に「${options.defaultLyric}」を設定しました。`);
    }
    if (!notes.length) {
        warnings.push(`${part.name}: 変換できる音符がありません。`);
    }

    return {
        id: part.id,
        name: part.name,
        voice: "main",
        notes,
        tempos: [],
        timeSignatures: [],
        totalTick: Math.max(...notes.map(note => note.tick + note.duration), 0),
        warnings
    };
}

function normalizeSvpLyric(lyric, defaultLyric) {
    const value = String(lyric || "").trim();
    if (!value) return defaultLyric;
    if (value === "+" || value === "-") return "ー";
    return value;
}

function parsePartTimeline(part, selectedVoice, options) {
    let divisions = 1;
    let globalTick = 0;
    let activeTime = { numerator: 4, denominator: 4 };
    const rawNotes = [];
    const tempos = [];
    const timeSignatures = [];
    const warnings = [];
    const measures = directChildren(part.node, "measure");
    const measureContexts = buildMeasureContexts(measures);
    const playback = buildMeasurePlayback(measures, options.expandRepeats);

    playback.entries.forEach((playbackEntry, playbackIndex) => {
        const measure = measures[playbackEntry.measureIndex];
        const measureContext = measureContexts[playbackEntry.measureIndex];
        divisions = measureContext.divisions;
        activeTime = { ...measureContext.time };
        let cursor = 0;
        let maxCursor = 0;
        let lastNoteStart = 0;

        Array.from(measure.children).forEach(item => {
            if (item.localName === "attributes") {
                const divisionsText = childText(item, "divisions");
                if (divisionsText) {
                    divisions = Math.max(numberValue(divisionsText, divisions), 1);
                }
                const time = firstChild(item, "time");
                if (time) {
                    const numerator = Math.max(1, Math.round(numberValue(childText(time, "beats"), activeTime.numerator)));
                    const denominator = Math.max(1, Math.round(numberValue(childText(time, "beat-type"), activeTime.denominator)));
                    activeTime = { numerator, denominator };
                    timeSignatures.push({ measure: playbackIndex, numerator, denominator });
                }
                return;
            }

            if (item.localName === "backup" || item.localName === "forward") {
                const duration = durationToTicks(childText(item, "duration"), divisions);
                cursor += item.localName === "backup" ? -duration : duration;
                cursor = Math.max(0, cursor);
                maxCursor = Math.max(maxCursor, cursor);
                return;
            }

            if (item.localName === "direction") {
                const offset = durationToTicks(childText(item, "offset"), divisions, true);
                const tempo = readTempo(item);
                if (tempo !== null) {
                    tempos.push({ tick: Math.max(0, globalTick + cursor + offset), bpm: tempo });
                }
                return;
            }

            if (item.localName !== "note") return;

            const duration = durationToTicks(childText(item, "duration"), divisions);
            const isChord = Boolean(firstChild(item, "chord"));
            const startTick = isChord ? lastNoteStart : cursor;
            if (!isChord) {
                lastNoteStart = cursor;
            }

            const voice = childText(item, "voice", "1");
            const pitchValue = musicXmlPitchToMidi(item);
            const isGrace = Boolean(firstChild(item, "grace"));
            if (voice === selectedVoice && pitchValue !== null && !isGrace) {
                const roundedPitch = Math.round(pitchValue + options.transpose);
                if (roundedPitch < 0 || roundedPitch > 127) {
                    warnings.push(`${part.name}: MIDI範囲外の音符を0〜127へ収めました。`);
                }
                if (!Number.isInteger(pitchValue)) {
                    warnings.push(`${part.name}: 微分音は最も近い半音へ丸めました。`);
                }

                const lyricData = readLyric(item, options.defaultLyric, playbackEntry.lyricPass);
                const tieTypes = readTieTypes(item);
                rawNotes.push({
                    tick: Math.max(0, globalTick + startTick),
                    duration: Math.max(duration, 1),
                    noteNumber: clamp(roundedPitch, 0, 127),
                    lyric: lyricData.lyric,
                    usedDefaultLyric: lyricData.usedDefault,
                    generatedPhoneme: true,
                    tieStart: tieTypes.has("start"),
                    tieStop: tieTypes.has("stop"),
                    measure: playbackEntry.measureIndex + 1,
                    repeatPass: playbackEntry.lyricPass,
                    sourceOrder: rawNotes.length
                });
            } else if (voice === selectedVoice && isGrace && pitchValue !== null) {
                warnings.push(`${part.name}: 装飾音は長さを確定できないため省略しました。`);
            }

            if (!isChord) {
                cursor += duration;
                maxCursor = Math.max(maxCursor, cursor);
            }
        });

        let measureSpan = Math.max(maxCursor, cursor);
        if (measureSpan <= 0) {
            measureSpan = Math.round(TPQN * 4 * activeTime.numerator / activeTime.denominator);
        }
        globalTick += measureSpan;
    });

    let notes = applyChordPolicy(rawNotes, options.chordPolicy, part, warnings);
    if (options.mergeTies) {
        notes = mergeTiedNotes(notes);
    }
    notes.sort((a, b) => a.tick - b.tick || a.noteNumber - b.noteNumber || a.sourceOrder - b.sourceOrder);
    if (options.trimOverlaps) {
        notes = trimNoteOverlaps(notes, part, warnings);
    }

    const totalTick = Math.max(globalTick, ...notes.map(note => note.tick + note.duration), 0);
    if (!notes.length) {
        warnings.push(`${part.name}: 選択したVoice ${selectedVoice}に変換できる音符がありません。`);
    }
    const defaultLyricCount = notes.filter(note => note.usedDefaultLyric).length;
    if (defaultLyricCount) {
        warnings.push(`${part.name}: 歌詞がない${defaultLyricCount}音に「${options.defaultLyric}」を設定しました。`);
    }
    if (playback.expandedRepeatCount) {
        warnings.push(`${part.name}: ${playback.expandedRepeatCount}か所のリピートを展開し、${measures.length}小節を${playback.entries.length}小節の演奏順に変換しました。`);
    } else if (!options.expandRepeats && (descendants(part.node, "repeat").length || descendants(part.node, "ending").length)) {
        warnings.push(`${part.name}: リピート記号と括弧は展開せず、記譜された小節順で変換しました。`);
    }
    warnings.push(...playback.warnings.map(message => `${part.name}: ${message}`));

    return {
        id: part.id,
        name: part.name,
        voice: selectedVoice,
        notes,
        tempos,
        timeSignatures,
        totalTick,
        warnings
    };
}

function buildMeasureContexts(measures) {
    let divisions = 1;
    let time = { numerator: 4, denominator: 4 };
    return measures.map(measure => {
        const attributes = directChildren(measure, "attributes");
        attributes.forEach(item => {
            const divisionsText = childText(item, "divisions");
            if (divisionsText) {
                divisions = Math.max(numberValue(divisionsText, divisions), 1);
            }
            const timeNode = firstChild(item, "time");
            if (timeNode) {
                time = {
                    numerator: Math.max(1, Math.round(numberValue(childText(timeNode, "beats"), time.numerator))),
                    denominator: Math.max(1, Math.round(numberValue(childText(timeNode, "beat-type"), time.denominator)))
                };
            }
        });
        return { divisions, time: { ...time } };
    });
}

function buildMeasurePlayback(measures, expandRepeats) {
    const metadata = analyzeMeasureRepeats(measures);
    const hasRepeatData = metadata.some(item => item.forwardRepeat || item.backwardRepeat || item.endingNumbers.length);
    if (!expandRepeats || !hasRepeatData) {
        return {
            entries: measures.map((measure, measureIndex) => ({
                measureIndex,
                lyricPass: 1
            })),
            expandedRepeatCount: 0,
            warnings: []
        };
    }

    const warnings = [];
    const rootBlocks = [];
    const stack = [];

    metadata.forEach((item, measureIndex) => {
        if (item.forwardRepeat) {
            stack.push({ start: measureIndex, end: null, times: 2, children: [] });
        }
        if (item.backwardRepeat) {
            let block = stack.pop();
            if (!block) {
                block = { start: 0, end: null, times: 2, children: [] };
            }
            block.end = measureIndex;
            block.times = clamp(item.repeatTimes || 2, 2, 8);
            if (stack.length) {
                stack[stack.length - 1].children.push(block);
            } else {
                rootBlocks.push(block);
            }
        }
    });

    stack.forEach(block => {
        warnings.push(`${block.start + 1}小節目の開始リピートに対応する終了記号がないため、展開しませんでした。`);
    });

    const closedBlocks = collectRepeatBlocks(rootBlocks);
    const entries = [];

    function expandSpan(start, end, blocks, repeatPass, respectEndings) {
        const blockByStart = new Map(blocks.map(block => [block.start, block]));
        let measureIndex = start;
        while (measureIndex <= end) {
            const block = blockByStart.get(measureIndex);
            if (block && block.end !== null && block.end <= end) {
                for (let pass = 1; pass <= block.times; pass += 1) {
                    expandSpan(block.start, block.end, block.children, pass, true);
                }
                measureIndex = block.end + 1;
                continue;
            }

            const endingNumbers = metadata[measureIndex].endingNumbers;
            const shouldPlay = !respectEndings || !endingNumbers.length || endingNumbers.includes(repeatPass);
            if (shouldPlay) {
                entries.push({
                    measureIndex,
                    lyricPass: respectEndings
                        ? repeatPass
                        : endingNumbers[0] || 1
                });
            }
            measureIndex += 1;
        }
    }

    expandSpan(0, measures.length - 1, rootBlocks, 1, false);

    if (entries.length > measures.length * 8) {
        warnings.push("展開後の小節数が多すぎるため、先頭側のみを使用しました。");
        entries.length = measures.length * 8;
    }

    return {
        entries,
        expandedRepeatCount: closedBlocks.length,
        warnings
    };
}

function collectRepeatBlocks(blocks) {
    return blocks.flatMap(block => [block, ...collectRepeatBlocks(block.children)]);
}

function analyzeMeasureRepeats(measures) {
    let activeEndingNumbers = [];
    return measures.map(measure => {
        const endings = descendants(measure, "ending");
        const startingEnding = endings.find(ending => ending.getAttribute("type") === "start");
        if (startingEnding) {
            activeEndingNumbers = parseNumberList(startingEnding.getAttribute("number"));
        }

        const repeatNodes = descendants(measure, "repeat");
        const forwardRepeat = repeatNodes.some(repeat => repeat.getAttribute("direction") === "forward");
        const backwardNode = repeatNodes.find(repeat => repeat.getAttribute("direction") === "backward");
        const result = {
            forwardRepeat,
            backwardRepeat: Boolean(backwardNode),
            repeatTimes: backwardNode ? Math.round(numberValue(backwardNode.getAttribute("times"), 2)) : 0,
            endingNumbers: [...activeEndingNumbers]
        };

        if (endings.some(ending => {
            const type = ending.getAttribute("type");
            return type === "stop" || type === "discontinue";
        })) {
            activeEndingNumbers = [];
        }
        return result;
    });
}

function parseNumberList(value) {
    return String(value || "")
        .split(/[,\s]+/)
        .map(item => Number.parseInt(item, 10))
        .filter(number => Number.isInteger(number) && number > 0);
}

function durationToTicks(value, divisions, allowNegative = false) {
    const duration = numberValue(value, 0);
    const ticks = Math.round(duration / Math.max(divisions, 1) * TPQN);
    return allowNegative ? ticks : Math.max(0, ticks);
}

function readTempo(direction) {
    const sound = descendants(direction, "sound").find(node => node.hasAttribute("tempo"));
    if (sound) {
        const bpm = numberValue(sound.getAttribute("tempo"), NaN);
        if (Number.isFinite(bpm) && bpm > 0) return bpm;
    }

    const metronome = descendants(direction, "metronome")[0];
    if (!metronome) return null;
    const perMinute = numberValue(descendantText(metronome, "per-minute"), NaN);
    if (!Number.isFinite(perMinute) || perMinute <= 0) return null;
    const beatUnit = descendantText(metronome, "beat-unit", "quarter");
    const multipliers = {
        whole: 4,
        half: 2,
        quarter: 1,
        eighth: 0.5,
        "16th": 0.25,
        "32nd": 0.125
    };
    let multiplier = multipliers[beatUnit] || 1;
    const dotCount = descendants(metronome, "beat-unit-dot").length;
    for (let index = 0; index < dotCount; index += 1) {
        multiplier *= 1.5;
    }
    return perMinute * multiplier;
}

function readLyric(note, defaultLyric, lyricPass = 1) {
    const lyricNodes = directChildren(note, "lyric");
    const hasTimedLyrics = lyricNodes.some(lyric => lyric.hasAttribute("time-only"));
    const hasNumberedLyrics = lyricNodes.some(lyric =>
        /^\d+$/.test(String(lyric.getAttribute("number") || "").trim())
    );
    const timedMatch = lyricNodes.find(lyric =>
        parseNumberList(lyric.getAttribute("time-only")).includes(lyricPass)
    );
    const numberedMatch = lyricNodes.find(lyric =>
        String(lyric.getAttribute("number") || "").trim() === String(lyricPass)
    );
    const indexedMatch = lyricNodes.length > 1 ? lyricNodes[lyricPass - 1] : null;
    const preferred = hasTimedLyrics
        ? timedMatch || null
        : hasNumberedLyrics
            ? numberedMatch || null
            : indexedMatch || lyricNodes[0] || null;
    const withText = preferred && childText(preferred, "text")
        ? preferred
        : null;
    if (withText) {
        const pieces = directChildren(withText, "text").map(node => node.textContent.trim()).filter(Boolean);
        return { lyric: pieces.join("") || defaultLyric, usedDefault: false };
    }
    const extended = preferred
        ? Boolean(firstChild(preferred, "extend"))
        : lyricNodes.some(lyric => firstChild(lyric, "extend"));
    return { lyric: extended ? "ー" : defaultLyric, usedDefault: !extended };
}

function readTieTypes(note) {
    const types = new Set();
    directChildren(note, "tie").forEach(tie => {
        if (tie.getAttribute("type")) types.add(tie.getAttribute("type"));
    });
    descendants(note, "tied").forEach(tie => {
        if (tie.getAttribute("type")) types.add(tie.getAttribute("type"));
    });
    return types;
}

function applyChordPolicy(notes, policy, part, warnings) {
    const byTick = new Map();
    notes.forEach(note => {
        const group = byTick.get(note.tick) || [];
        group.push(note);
        byTick.set(note.tick, group);
    });

    let chordGroups = 0;
    const selected = [];
    byTick.forEach(group => {
        if (group.length === 1) {
            selected.push(group[0]);
            return;
        }
        chordGroups += 1;
        if (policy === "first") {
            selected.push(group.sort((a, b) => a.sourceOrder - b.sourceOrder)[0]);
        } else if (policy === "lowest") {
            selected.push(group.sort((a, b) => a.noteNumber - b.noteNumber)[0]);
        } else {
            selected.push(group.sort((a, b) => b.noteNumber - a.noteNumber)[0]);
        }
    });
    if (chordGroups) {
        const policyLabel = { highest: "最高音", lowest: "最低音", first: "先頭音" }[policy];
        warnings.push(`${part.name}: ${chordGroups}か所の同時発音から${policyLabel}を選びました。`);
    }
    return selected;
}

function mergeTiedNotes(notes) {
    const result = [];
    const openTies = new Map();
    [...notes].sort((a, b) => a.tick - b.tick || a.sourceOrder - b.sourceOrder).forEach(note => {
        const key = String(note.noteNumber);
        const open = openTies.get(key);
        if (note.tieStop && open) {
            open.duration = Math.max(open.duration, note.tick + note.duration - open.tick);
            if (note.tieStart) {
                openTies.set(key, open);
            } else {
                openTies.delete(key);
            }
            return;
        }
        result.push(note);
        if (note.tieStart) {
            openTies.set(key, note);
        }
    });
    return result;
}

function trimNoteOverlaps(notes, part, warnings) {
    let trimCount = 0;
    const result = notes.map(note => ({ ...note }));
    for (let index = 0; index < result.length - 1; index += 1) {
        const current = result[index];
        const next = result[index + 1];
        if (current.tick < next.tick && current.tick + current.duration > next.tick) {
            current.duration = Math.max(1, next.tick - current.tick);
            trimCount += 1;
        }
    }
    if (trimCount) {
        warnings.push(`${part.name}: 重なっていた${trimCount}音の長さを調整しました。`);
    }
    return result;
}

function normalizeTempoEvents(events, defaultTempo) {
    const sorted = [{ tick: 0, bpm: defaultTempo }, ...events]
        .filter(event => Number.isFinite(event.bpm) && event.bpm > 0)
        .sort((a, b) => a.tick - b.tick);
    const byTick = new Map();
    sorted.forEach(event => byTick.set(Math.max(0, Math.round(event.tick)), {
        tick: Math.max(0, Math.round(event.tick)),
        bpm: clamp(event.bpm, 1, 999)
    }));
    return [...byTick.values()].sort((a, b) => a.tick - b.tick);
}

function normalizeTimeSignatures(events) {
    const byMeasure = new Map();
    [{ measure: 0, numerator: 4, denominator: 4 }, ...events].forEach(event => {
        byMeasure.set(Math.max(0, Math.round(event.measure)), event);
    });
    return [...byMeasure.values()].sort((a, b) => a.measure - b.measure);
}

function updatePreview() {
    if (!state.score) return;
    state.preview = buildPreview();
    const preview = state.preview;
    const noteCount = preview.tracks.reduce((sum, track) => sum + track.notes.length, 0);

    refs.previewTrackCount.textContent = String(preview.tracks.length);
    refs.previewNoteCount.textContent = String(noteCount);
    refs.previewTempoCount.textContent = String(preview.tempos.length);
    refs.exportButton.disabled = noteCount === 0;
    refs.emptyPreview.hidden = noteCount > 0;
    refs.exportDescription.textContent = preview.tracks.length
        ? `${preview.tracks.map(track => track.name).join("、")}をVSQX 4形式で保存します。`
        : "変換するパートを1つ以上選択してください。";

    renderNoteTable(preview);
    renderWarnings(preview);
    renderLyricsTransfer(preview);
    drawPianoRoll(preview);
    setCurrentStep(preview.tracks.length ? 3 : 2);
}

function renderNoteTable(preview) {
    const rows = [];
    preview.tracks.forEach((track, trackIndex) => {
        track.notes.forEach(note => rows.push({ track, trackIndex, note }));
    });
    rows.sort((a, b) => a.note.tick - b.note.tick || a.trackIndex - b.trackIndex);
    const visibleRows = rows.slice(0, 120);
    refs.notesBody.replaceChildren(...visibleRows.map(item => {
        const row = document.createElement("tr");
        [
            item.track.name,
            formatTick(item.note.tick),
            midiToNoteName(item.note.noteNumber),
            String(item.note.duration),
            item.note.lyric
        ].forEach(text => {
            const cell = document.createElement("td");
            cell.textContent = text;
            row.append(cell);
        });
        return row;
    }));
    refs.tableNote.textContent = rows.length > visibleRows.length
        ? `先頭${visibleRows.length}音を表示しています（全${rows.length}音）。`
        : rows.length ? `全${rows.length}音を表示しています。` : "音符はまだありません。";
}

function renderWarnings(preview) {
    if (!preview.warnings.length) {
        const item = document.createElement("li");
        item.className = "is-ok";
        item.textContent = "変換上の警告はありません。";
        refs.warningsList.replaceChildren(item);
        return;
    }
    refs.warningsList.replaceChildren(...preview.warnings.map(message => {
        const item = document.createElement("li");
        item.textContent = message;
        return item;
    }));
}

function renderLyricsTransfer(preview) {
    const previousTrackId = refs.lyricsTrackSelect.value;
    const options = preview.tracks.map(track => {
        const option = document.createElement("option");
        option.value = track.id;
        option.textContent = `${track.name}（${track.notes.length}音）`;
        return option;
    });
    refs.lyricsTrackSelect.replaceChildren(...options);

    const hasPrevious = preview.tracks.some(track => track.id === previousTrackId);
    if (hasPrevious) {
        refs.lyricsTrackSelect.value = previousTrackId;
    } else if (preview.tracks[0]) {
        refs.lyricsTrackSelect.value = preview.tracks[0].id;
    }

    refs.lyricsTrackSelect.disabled = preview.tracks.length === 0;
    updateLyricsTransferText();
}

function updateLyricsTransferText() {
    const preview = state.preview;
    const track = preview?.tracks.find(item => item.id === refs.lyricsTrackSelect.value);
    if (!track) {
        refs.lyricsOutput.value = "";
        refs.lyricsCount.textContent = "0音分";
        refs.copyLyricsButton.disabled = true;
        refs.lyricsCopyStatus.textContent = "変換するトラックを選択してください。";
        return;
    }

    const separator = {
        space: " ",
        newline: "\n",
        none: ""
    }[refs.lyricsSeparatorSelect.value] ?? " ";
    const lyrics = track.notes.map(note =>
        String(note.lyric || preview.options?.defaultLyric || "あ").trim()
    );
    refs.lyricsOutput.value = lyrics.join(separator);
    refs.lyricsCount.textContent = `${lyrics.length}音分`;
    refs.copyLyricsButton.disabled = lyrics.length === 0;
    refs.lyricsCopyStatus.textContent = {
        space: "半角スペース区切りで、VOCALOIDの歌詞入力へ貼り付けられます。",
        newline: "1音ずつ改行してコピーします。",
        none: "歌詞を区切らず連結してコピーします。"
    }[refs.lyricsSeparatorSelect.value] || "";
}

async function copyLyricsToClipboard() {
    const text = refs.lyricsOutput.value;
    if (!text) return;

    let copied = false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            copied = true;
        }
    } catch {
        copied = false;
    }

    if (!copied) {
        refs.lyricsOutput.focus();
        refs.lyricsOutput.select();
        try {
            copied = document.execCommand("copy");
        } catch {
            copied = false;
        }
        refs.lyricsOutput.setSelectionRange(0, 0);
    }

    const originalLabel = refs.copyLyricsButton.textContent;
    refs.copyLyricsButton.textContent = copied ? "コピーしました" : "コピーできませんでした";
    refs.lyricsCopyStatus.textContent = copied
        ? `${refs.lyricsCount.textContent}の歌詞をクリップボードへコピーしました。`
        : "歌詞欄を選択し、Ctrl+Cでコピーしてください。";
    setTimeout(() => {
        refs.copyLyricsButton.textContent = originalLabel;
        updateLyricsTransferText();
    }, 1600);
}

function drawPianoRoll(preview) {
    const canvas = refs.pianoRoll;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(Math.round(rect.width), 320);
    const cssHeight = 280;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = "#0a1120";
    context.fillRect(0, 0, cssWidth, cssHeight);

    const allNotes = preview.tracks.flatMap((track, trackIndex) =>
        track.notes.map(note => ({ ...note, trackIndex }))
    );
    if (!allNotes.length) return;

    const minPitch = clamp(Math.min(...allNotes.map(note => note.noteNumber)) - 2, 0, 127);
    const maxPitch = clamp(Math.max(...allNotes.map(note => note.noteNumber)) + 2, 0, 127);
    const pitchSpan = Math.max(maxPitch - minPitch + 1, 8);
    const labelWidth = 48;
    const top = 12;
    const plotWidth = cssWidth - labelWidth - 12;
    const plotHeight = cssHeight - top - 24;
    const totalTick = Math.max(preview.totalTick, TPQN * 4);
    const rowHeight = plotHeight / pitchSpan;

    context.font = "10px ui-monospace, monospace";
    context.textBaseline = "middle";
    for (let pitch = minPitch; pitch <= maxPitch; pitch += 1) {
        const y = top + (maxPitch - pitch) * rowHeight;
        const isC = pitch % 12 === 0;
        context.fillStyle = isC ? "rgba(56, 189, 248, 0.045)" : "rgba(255, 255, 255, 0.012)";
        context.fillRect(labelWidth, y, plotWidth, Math.max(rowHeight, 1));
        context.strokeStyle = isC ? "rgba(56, 189, 248, 0.18)" : "rgba(255, 255, 255, 0.045)";
        context.beginPath();
        context.moveTo(labelWidth, y);
        context.lineTo(cssWidth - 12, y);
        context.stroke();
        if (isC || rowHeight >= 13) {
            context.fillStyle = isC ? "#bae6fd" : "#64748b";
            context.fillText(midiToNoteName(pitch), 6, y + rowHeight / 2);
        }
    }

    const gridStep = totalTick > TPQN * 64 ? TPQN * 4 : totalTick > TPQN * 24 ? TPQN * 2 : TPQN;
    for (let tick = 0; tick <= totalTick; tick += gridStep) {
        const x = labelWidth + tick / totalTick * plotWidth;
        context.strokeStyle = tick % (TPQN * 4) === 0
            ? "rgba(148, 163, 184, 0.24)"
            : "rgba(148, 163, 184, 0.1)";
        context.beginPath();
        context.moveTo(x, top);
        context.lineTo(x, top + plotHeight);
        context.stroke();
    }

    allNotes.forEach(note => {
        const x = labelWidth + note.tick / totalTick * plotWidth;
        const width = Math.max(note.duration / totalTick * plotWidth, 2);
        const y = top + (maxPitch - note.noteNumber) * rowHeight + 1;
        const height = Math.max(rowHeight - 2, 3);
        const color = TRACK_COLORS[note.trackIndex % TRACK_COLORS.length];
        context.fillStyle = color;
        context.globalAlpha = 0.76;
        roundRect(context, x, y, width, height, Math.min(3, height / 2));
        context.fill();
        context.globalAlpha = 1;
    });
}

function roundRect(context, x, y, width, height, radius) {
    const right = x + width;
    const bottom = y + height;
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(right - radius, y);
    context.quadraticCurveTo(right, y, right, y + radius);
    context.lineTo(right, bottom - radius);
    context.quadraticCurveTo(right, bottom, right - radius, bottom);
    context.lineTo(x + radius, bottom);
    context.quadraticCurveTo(x, bottom, x, bottom - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
}

function midiToNoteName(noteNumber) {
    const rounded = Math.round(noteNumber);
    return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

function formatTick(tick) {
    const quarter = Math.floor(tick / TPQN);
    const remainder = tick % TPQN;
    return `${quarter + 1}:${String(remainder).padStart(3, "0")}`;
}

function buildVsqx(score, preview) {
    const firstTime = preview.timeSignatures[0] || { numerator: 4, denominator: 4 };
    const preMeasureTicks = Math.round(TPQN * 4 * firstTime.numerator / firstTime.denominator);
    const sequenceName = score.title || "MusicXML Conversion";
    const tempoXml = preview.tempos.map((tempo, index) => {
        const tick = index === 0 ? 0 : tempo.tick + preMeasureTicks;
        return [
            "      <tempo>",
            `        <t>${Math.max(0, Math.round(tick))}</t>`,
            `        <v>${Math.round(tempo.bpm * 100)}</v>`,
            "      </tempo>"
        ].join("\n");
    }).join("\n");
    const timeSignatureXml = preview.timeSignatures.map(signature => [
        "      <timeSig>",
        `        <m>${Math.max(0, Math.round(signature.measure))}</m>`,
        `        <nu>${Math.max(1, Math.round(signature.numerator))}</nu>`,
        `        <de>${Math.max(1, Math.round(signature.denominator))}</de>`,
        "      </timeSig>"
    ].join("\n")).join("\n");
    const mixerUnits = preview.tracks.map((track, index) => [
        "      <vsUnit>",
        `        <tNo>${index}</tNo>`,
        "        <iGin>0</iGin>",
        "        <sLvl>-898</sLvl>",
        "        <sEnable>0</sEnable>",
        "        <m>0</m>",
        "        <s>0</s>",
        "        <pan>64</pan>",
        "        <vol>0</vol>",
        "      </vsUnit>"
    ].join("\n")).join("\n");
    const tracksXml = preview.tracks.map((track, index) => buildVsqxTrack(track, index, preMeasureTicks)).join("\n");

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<vsq4 xmlns="http://www.yamaha.co.jp/vocaloid/schema/vsq4/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.yamaha.co.jp/vocaloid/schema/vsq4/ vsq4.xsd">
  <vender><![CDATA[Yamaha corporation]]></vender>
  <version><![CDATA[4.0.0.3]]></version>
  <vVoiceTable>
    <vVoice>
      <bs>0</bs>
      <pc>0</pc>
      <id><![CDATA[MUSICXML2VSQX001]]></id>
      <name><![CDATA[Default Voice]]></name>
      <vPrm>
        <bre>0</bre>
        <bri>0</bri>
        <cle>0</cle>
        <gen>0</gen>
        <ope>0</ope>
      </vPrm>
    </vVoice>
  </vVoiceTable>
  <mixer>
    <masterUnit>
      <oDev>0</oDev>
      <rLvl>0</rLvl>
      <vol>0</vol>
    </masterUnit>
${mixerUnits}
    <monoUnit>
      <iGin>0</iGin>
      <sLvl>-898</sLvl>
      <sEnable>0</sEnable>
      <m>0</m>
      <s>0</s>
      <pan>64</pan>
      <vol>0</vol>
    </monoUnit>
    <stUnit>
      <iGin>0</iGin>
      <m>0</m>
      <s>0</s>
      <vol>-129</vol>
    </stUnit>
  </mixer>
  <masterTrack>
    <seqName>${cdata(sequenceName)}</seqName>
    <comment><![CDATA[Converted from MusicXML by MyTools]]></comment>
    <resolution>${TPQN}</resolution>
    <preMeasure>1</preMeasure>
${timeSignatureXml}
${tempoXml}
  </masterTrack>
${tracksXml}
  <monoTrack/>
  <stTrack/>
  <aux>
    <id><![CDATA[AUX_VST_HOST_CHUNK_INFO]]></id>
    <content><![CDATA[VlNDSwAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=]]></content>
  </aux>
</vsq4>
`;
}

function buildVsqxTrack(track, trackNumber, preMeasureTicks) {
    const playTime = Math.max(track.totalTick, ...track.notes.map(note => note.tick + note.duration), TPQN);
    const notesXml = track.notes.map(note => [
        "      <note>",
        `        <t>${Math.max(0, Math.round(note.tick))}</t>`,
        `        <dur>${Math.max(1, Math.round(note.duration))}</dur>`,
        `        <n>${clamp(Math.round(note.noteNumber), 0, 127)}</n>`,
        "        <v>64</v>",
        `        <y>${cdata(note.lyric)}</y>`,
        "        <p><![CDATA[a]]></p>",
        "        <nStyle>",
        "          <v id=\"accent\">50</v>",
        "          <v id=\"bendDep\">8</v>",
        "          <v id=\"bendLen\">0</v>",
        "          <v id=\"decay\">50</v>",
        "          <v id=\"fallPort\">0</v>",
        "          <v id=\"opening\">127</v>",
        "          <v id=\"risePort\">0</v>",
        "          <v id=\"vibLen\">0</v>",
        "          <v id=\"vibType\">0</v>",
        "        </nStyle>",
        "      </note>"
    ].join("\n")).join("\n");

    return `  <vsTrack>
    <tNo>${trackNumber}</tNo>
    <name>${cdata(track.name)}</name>
    <comment>${cdata(`MusicXML ${track.id} / Voice ${track.voice}`)}</comment>
    <vsPart>
      <t>${preMeasureTicks}</t>
      <playTime>${Math.max(1, Math.round(playTime))}</playTime>
      <name>${cdata(track.name)}</name>
      <comment><![CDATA[Converted vocal part]]></comment>
      <sPlug>
        <id><![CDATA[ACA9C502-A04B-42b5-B2EB-5CEA36D16FCE]]></id>
        <name><![CDATA[VOCALOID2 Compatible Style]]></name>
        <version><![CDATA[3.0.0.1]]></version>
      </sPlug>
      <pStyle>
        <v id="accent">50</v>
        <v id="bendDep">8</v>
        <v id="bendLen">0</v>
        <v id="decay">50</v>
        <v id="fallPort">0</v>
        <v id="opening">127</v>
        <v id="risePort">0</v>
      </pStyle>
      <singer>
        <t>0</t>
        <bs>0</bs>
        <pc>0</pc>
      </singer>
      <cc><t>0</t><v id="D">64</v></cc>
      <cc><t>0</t><v id="B">0</v></cc>
      <cc><t>0</t><v id="R">64</v></cc>
      <cc><t>0</t><v id="C">0</v></cc>
      <cc><t>0</t><v id="G">64</v></cc>
      <cc><t>0</t><v id="P">0</v></cc>
      <cc><t>0</t><v id="S">2</v></cc>
      <cc><t>0</t><v id="T">64</v></cc>
      <cc><t>0</t><v id="X">0</v></cc>
      <cc><t>0</t><v id="W">0</v></cc>
${notesXml}
      <plane>0</plane>
    </vsPart>
  </vsTrack>`;
}

function cdata(value) {
    return `<![CDATA[${String(value ?? "").replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function downloadVsqx() {
    if (!state.score || !state.preview) return;
    const noteCount = state.preview.tracks.reduce((sum, track) => sum + track.notes.length, 0);
    if (!noteCount) return;
    const vsqx = buildVsqx(state.score, state.preview);
    const validationErrors = validateVsqx4Structure(vsqx);
    if (validationErrors.length) {
        console.error("VSQX4 validation failed", validationErrors);
        showError(`VSQX4の構造検査に失敗したため保存を中止しました。${validationErrors.join(" / ")}`);
        return;
    }
    refs.errorMessage.hidden = true;
    const blob = new Blob([vsqx], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFileName(state.score.title || "converted")}.vsqx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validateVsqx4Structure(source) {
    const errors = [];
    const documentNode = new DOMParser().parseFromString(source, "application/xml");
    const parserError = descendants(documentNode, "parsererror")[0];
    if (parserError) {
        return ["XMLとして正しく解析できません。"];
    }

    const root = documentNode.documentElement;
    if (root?.localName !== "vsq4" ||
        root.namespaceURI !== "http://www.yamaha.co.jp/vocaloid/schema/vsq4/") {
        errors.push("VSQX4のルート要素または名前空間が不正です。");
        return errors;
    }

    const requiredRootChildren = [
        "vender",
        "version",
        "vVoiceTable",
        "mixer",
        "masterTrack",
        "vsTrack",
        "monoTrack",
        "stTrack"
    ];
    requiredRootChildren.forEach(name => {
        if (!firstChild(root, name)) errors.push(`必須要素 ${name} がありません。`);
    });

    const mixer = firstChild(root, "mixer");
    ["masterUnit", "vsUnit", "monoUnit", "stUnit"].forEach(name => {
        if (mixer && !firstChild(mixer, name)) errors.push(`mixer/${name} がありません。`);
    });

    const tracks = directChildren(root, "vsTrack");
    const trackNumbers = new Set();
    tracks.forEach((track, trackIndex) => {
        const trackNumber = childText(track, "tNo");
        if (!/^\d+$/.test(trackNumber)) {
            errors.push(`トラック${trackIndex + 1}の tNo が不正です。`);
        } else if (trackNumbers.has(trackNumber)) {
            errors.push(`トラック番号 ${trackNumber} が重複しています。`);
        }
        trackNumbers.add(trackNumber);

        const parts = directChildren(track, "vsPart");
        if (!parts.length) errors.push(`トラック${trackIndex + 1}に vsPart がありません。`);
        parts.forEach((part, partIndex) => {
            ["t", "playTime", "sPlug", "pStyle", "singer", "note", "plane"].forEach(name => {
                if (!firstChild(part, name)) {
                    errors.push(`トラック${trackIndex + 1}・パート${partIndex + 1}に ${name} がありません。`);
                }
            });
            directChildren(part, "note").forEach((note, noteIndex) => {
                const position = numberValue(childText(note, "t"), NaN);
                const duration = numberValue(childText(note, "dur"), NaN);
                const noteNumber = numberValue(childText(note, "n"), NaN);
                if (!Number.isInteger(position) || position < 0) {
                    errors.push(`トラック${trackIndex + 1}・音符${noteIndex + 1}の位置が不正です。`);
                }
                if (!Number.isInteger(duration) || duration < 1) {
                    errors.push(`トラック${trackIndex + 1}・音符${noteIndex + 1}の長さが不正です。`);
                }
                if (!Number.isInteger(noteNumber) || noteNumber < 0 || noteNumber > 127) {
                    errors.push(`トラック${trackIndex + 1}・音符${noteIndex + 1}の音程が不正です。`);
                }
            });
        });
    });

    const vsUnitCount = mixer ? directChildren(mixer, "vsUnit").length : 0;
    if (vsUnitCount !== tracks.length) {
        errors.push(`vsUnit数（${vsUnitCount}）とvsTrack数（${tracks.length}）が一致しません。`);
    }

    const vsq3OnlyNames = ["musicalPart", "stylePlugin", "partStyle", "seTrack", "karaokeTrack"];
    vsq3OnlyNames.forEach(name => {
        if (descendants(root, name).length) {
            errors.push(`VSQX4内にVSQX3用要素 ${name} が残っています。`);
        }
    });

    return [...new Set(errors)];
}

function sanitizeFileName(value) {
    return String(value)
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .replace(/[.\s]+$/g, "")
        .slice(0, 120) || "converted";
}

function parseSvp(source, fileName) {
    let payload;
    try {
        payload = JSON.parse(
            String(source)
                .replace(/^\uFEFF/, "")
                .replace(/\u0000+$/, "")
        );
    } catch (error) {
        throw new Error(`SVPをJSONとして解析できませんでした。${error.message}`);
    }

    const project = payload?.project?.tracks ? payload.project : payload;
    const tracks = Array.isArray(project?.tracks) ? project.tracks : [];
    if (!tracks.length) {
        throw new Error("SVP内に変換できるトラックが見つかりませんでした。");
    }

    const blicksPerQuarter = numberValue(
        project.blicksPerQuarter ?? project.time?.blicksPerQuarter,
        SVP_BLICKS_PER_QUARTER
    );
    const libraryMap = buildSvpLibraryMap(project.library);
    const parts = tracks.map((track, index) =>
        analyzeSvpTrack(track, index, libraryMap, blicksPerQuarter)
    );
    const ranked = [...parts].sort((a, b) => b.candidateScore - a.candidateScore);
    const best = ranked.find(part => part.noteCount > 0) || ranked[0];
    parts.forEach(part => {
        part.selected = part.id === best.id;
        part.recommended = part.id === best.id;
        part.selectedVoice = "main";
    });

    const timeAxis = project.time || project.timeAxis || {};
    const tempoSource = Array.isArray(timeAxis.tempo)
        ? timeAxis.tempo
        : Array.isArray(project.tempo) ? project.tempo : [];
    const meterSource = Array.isArray(timeAxis.meter)
        ? timeAxis.meter
        : Array.isArray(project.meter) ? project.meter : [];
    const tempos = tempoSource.map(item => ({
        tick: svpBlickToTick(numberValue(item.position ?? item.blick, 0), blicksPerQuarter),
        bpm: numberValue(item.bpm ?? item.tempo, 120)
    }));
    const timeSignatures = meterSource.map(item => ({
        measure: Math.max(0, Math.round(numberValue(item.index ?? item.measure, 0))),
        numerator: Math.max(1, Math.round(numberValue(item.numerator, 4))),
        denominator: Math.max(1, Math.round(numberValue(item.denominator, 4)))
    }));
    const maxTick = Math.max(
        ...parts.flatMap(part => part.svpNotes.map(note => note.tick + note.duration)),
        0
    );
    const firstMeter = timeSignatures[0] || { numerator: 4, denominator: 4 };
    const ticksPerMeasure = TPQN * 4 * firstMeter.numerator / firstMeter.denominator;
    const title =
        String(project.name || project.title || "").trim() ||
        fileName.replace(/\.svp$/i, "");

    return {
        sourceType: "svp",
        title,
        parts,
        tempos,
        timeSignatures,
        totalLyrics: parts.reduce((sum, part) => sum + part.lyricCount, 0),
        measureCount: Math.max(1, Math.ceil(maxTick / Math.max(ticksPerMeasure, 1))),
        fileName,
        loadWarnings: [
            "SVPの歌声パラメータ、ピッチカーブ、発音記号、ボイス設定は変換せず、音符と歌詞のみを使用します。"
        ]
    };
}

function buildSvpLibraryMap(library) {
    let groups = [];
    if (Array.isArray(library)) {
        groups = library;
    } else if (Array.isArray(library?.groups)) {
        groups = library.groups;
    } else if (library && typeof library === "object") {
        groups = Object.values(library).filter(value => value && typeof value === "object");
    }
    const map = new Map();
    groups.forEach(group => {
        const id = getSvpGroupId(group);
        if (id) map.set(id, group);
    });
    return map;
}

function getSvpGroupId(group) {
    return String(group?.uuid ?? group?.id ?? group?.groupID ?? group?.groupId ?? "").trim();
}

function analyzeSvpTrack(track, index, libraryMap, blicksPerQuarter) {
    const importWarnings = [];
    const groupInstances = [];
    const mainGroup = track.mainGroup || track.main_group;
    if (mainGroup && Array.isArray(mainGroup.notes)) {
        groupInstances.push({ group: mainGroup, blickOffset: 0, pitchOffset: 0 });
    }

    const references = Array.isArray(track.groups)
        ? track.groups
        : Array.isArray(track.groupReferences) ? track.groupReferences : [];
    references.forEach(reference => {
        const referenceId = String(
            reference.groupID ?? reference.groupId ?? reference.targetID ?? reference.targetId ?? reference.uuid ?? ""
        ).trim();
        const group = Array.isArray(reference.notes) ? reference : libraryMap.get(referenceId);
        if (!group) {
            importWarnings.push(`参照ノートグループ「${referenceId || "ID不明"}」を見つけられなかったため省略しました。`);
            return;
        }
        groupInstances.push({
            group,
            blickOffset: numberValue(reference.blickOffset ?? reference.onset ?? reference.offset, 0),
            pitchOffset: numberValue(reference.pitchOffset ?? reference.pitch, 0)
        });
    });

    if (!groupInstances.length && Array.isArray(track.notes)) {
        groupInstances.push({ group: track, blickOffset: 0, pitchOffset: 0 });
    }

    const svpNotes = [];
    groupInstances.forEach(instance => {
        instance.group.notes.forEach(note => {
            const onset = numberValue(note.onset ?? note.position, NaN);
            const duration = numberValue(note.duration ?? note.length, NaN);
            const pitch = numberValue(note.pitch ?? note.noteNumber, NaN);
            if (![onset, duration, pitch].every(Number.isFinite) || duration <= 0) return;
            svpNotes.push({
                tick: Math.max(0, svpBlickToTick(onset + instance.blickOffset, blicksPerQuarter)),
                duration: Math.max(1, svpBlickToTick(duration, blicksPerQuarter)),
                noteNumber: pitch + instance.pitchOffset,
                lyric: String(note.lyrics ?? note.lyric ?? "")
            });
        });
    });
    svpNotes.sort((a, b) => a.tick - b.tick || a.noteNumber - b.noteNumber);

    const lyricCount = svpNotes.filter(note => note.lyric.trim() && note.lyric !== "+" && note.lyric !== "-").length;
    const pitches = svpNotes.map(note => note.noteNumber);
    const name = String(track.name || mainGroup?.name || `Track ${index + 1}`).trim();

    return {
        id: `SVP${index + 1}`,
        index,
        name,
        instrument: "Synthesizer V",
        noteCount: svpNotes.length,
        lyricCount,
        chordCount: 0,
        voices: [{
            id: "main",
            label: "全ノートグループ",
            noteCount: svpNotes.length,
            lyricCount
        }],
        staves: ["1"],
        minPitch: pitches.length ? Math.min(...pitches) : null,
        maxPitch: pitches.length ? Math.max(...pitches) : null,
        candidateScore: lyricCount * 1000 + svpNotes.length,
        selected: false,
        recommended: false,
        selectedVoice: "main",
        svpNotes,
        importWarnings
    };
}

function svpBlickToTick(blick, blicksPerQuarter = SVP_BLICKS_PER_QUARTER) {
    return Math.round(numberValue(blick, 0) / Math.max(blicksPerQuarter, 1) * TPQN);
}

function setLoadedScore(mode, score, fileName) {
    const session = { score, fileName };
    state.sessions[mode] = session;
    state.inputMode = mode;
    state.score = score;
    state.fileName = fileName;
    renderScore();
}

function activateSourceMode(mode) {
    state.inputMode = mode;
    const isMusicXml = mode === "musicxml";
    refs.musicXmlTab.classList.toggle("is-active", isMusicXml);
    refs.musicXmlTab.setAttribute("aria-selected", isMusicXml ? "true" : "false");
    refs.svpTab.classList.toggle("is-active", !isMusicXml);
    refs.svpTab.setAttribute("aria-selected", isMusicXml ? "false" : "true");
    refs.musicXmlPanel.hidden = !isMusicXml;
    refs.svpPanel.hidden = isMusicXml;
    refs.errorMessage.hidden = true;

    const session = state.sessions[mode];
    if (session) {
        state.score = session.score;
        state.fileName = session.fileName;
        renderScore();
    } else {
        state.score = null;
        state.fileName = "";
        state.preview = null;
        refs.fileSummary.hidden = true;
        refs.conversionArea.hidden = true;
        setCurrentStep(1);
    }
}

async function loadFile(file) {
    if (!file) return;
    if (!/\.(musicxml|xml|mxl)$/i.test(file.name)) {
        showError(".musicxml、.xml、または圧縮MusicXMLの.mxlファイルを選択してください。");
        return;
    }
    try {
        const loaded = await readMusicXmlSource(file);
        const score = parseMusicXML(loaded.source, file.name);
        score.archivePath = loaded.archivePath;
        score.loadWarnings = [
            ...(score.loadWarnings || []),
            ...loaded.warnings
        ];
        setLoadedScore("musicxml", score, file.name);
    } catch (error) {
        showError(error.message || "MusicXMLの読み込みに失敗しました。");
    } finally {
        refs.fileInput.value = "";
    }
}

async function loadSvpFile(file) {
    if (!file) return;
    if (!/\.svp$/i.test(file.name)) {
        showError(".svpファイルを選択してください。");
        return;
    }
    if (file.size > MAX_XML_CHARACTERS) {
        showError("SVPファイルが大きすぎます。60 MB以下のファイルを選択してください。");
        return;
    }
    try {
        const score = parseSvp(await file.text(), file.name);
        setLoadedScore("svp", score, file.name);
    } catch (error) {
        showError(error.message || "SVPの読み込みに失敗しました。");
    } finally {
        refs.svpFileInput.value = "";
    }
}

async function readMusicXmlSource(file) {
    if (!/\.mxl$/i.test(file.name)) {
        return {
            source: await file.text(),
            archivePath: "",
            warnings: []
        };
    }
    return extractMusicXmlFromMxl(file);
}

async function extractMusicXmlFromMxl(file) {
    if (typeof JSZip === "undefined") {
        throw new Error("圧縮MusicXMLの展開に必要なJSZipを読み込めませんでした。ネットワーク接続を確認してください。");
    }
    if (file.size > MAX_MXL_BYTES) {
        throw new Error("MXLファイルが大きすぎます。50 MB以下のファイルを選択してください。");
    }

    let archive;
    try {
        archive = await JSZip.loadAsync(file);
    } catch {
        throw new Error("MXLをZIPアーカイブとして展開できませんでした。ファイルが破損していないか確認してください。");
    }

    const warnings = [];
    const containerEntry = findArchiveEntry(archive, "META-INF/container.xml");
    let referencedPaths = [];

    if (containerEntry) {
        const containerXml = await readArchiveText(containerEntry, "container.xml");
        const containerDocument = new DOMParser().parseFromString(containerXml, "application/xml");
        const parserError = descendants(containerDocument, "parsererror")[0];
        if (parserError) {
            warnings.push("MXLのcontainer.xmlを解析できなかったため、楽譜XMLを自動検出しました。");
        } else {
            referencedPaths = descendants(containerDocument, "rootfile")
                .map(rootfile => ({
                    path: rootfile.getAttribute("full-path") || "",
                    mediaType: rootfile.getAttribute("media-type") || ""
                }))
                .filter(item => item.path)
                .sort((a, b) => {
                    const expected = "application/vnd.recordare.musicxml+xml";
                    return Number(b.mediaType === expected) - Number(a.mediaType === expected);
                })
                .map(item => item.path);
        }
    } else {
        warnings.push("MXLにcontainer.xmlがないため、楽譜XMLを自動検出しました。");
    }

    for (const path of referencedPaths) {
        const normalizedPath = normalizeArchivePath(path);
        if (!normalizedPath) {
            warnings.push("container.xmlに安全でない参照パスがあったため無視しました。");
            continue;
        }
        const entry = findArchiveEntry(archive, normalizedPath);
        if (!entry || entry.dir) {
            warnings.push(`container.xmlが参照する「${path}」が見つからないため、楽譜XMLを自動検出しました。`);
            continue;
        }
        const source = await readArchiveText(entry, normalizedPath);
        if (isPartwiseMusicXml(source)) {
            return { source, archivePath: entry.name, warnings };
        }
    }

    const fallbackEntries = Object.values(archive.files)
        .filter(entry => !entry.dir)
        .filter(entry => /\.(musicxml|xml)$/i.test(entry.name))
        .filter(entry => !/^META-INF\//i.test(normalizeArchivePath(entry.name) || ""))
        .sort(compareArchiveCandidates);

    for (const entry of fallbackEntries.slice(0, 30)) {
        const source = await readArchiveText(entry, entry.name);
        if (isPartwiseMusicXml(source)) {
            if (!warnings.some(message => message.includes("自動検出"))) {
                warnings.push("container.xmlの参照先を利用できなかったため、楽譜XMLを自動検出しました。");
            }
            return { source, archivePath: entry.name, warnings };
        }
    }

    throw new Error("MXL内にscore-partwise形式のMusicXMLが見つかりませんでした。");
}

function normalizeArchivePath(path) {
    const normalized = String(path || "")
        .replaceAll("\\", "/")
        .replace(/^\/+/, "")
        .replace(/^\.\/+/, "");
    if (!normalized || normalized.split("/").includes("..")) return "";
    return normalized;
}

function findArchiveEntry(archive, path) {
    const normalized = normalizeArchivePath(path);
    if (!normalized) return null;
    const direct = archive.file(normalized);
    if (direct) return direct;
    const expected = normalized.toLowerCase();
    return Object.values(archive.files).find(entry =>
        !entry.dir && normalizeArchivePath(entry.name).toLowerCase() === expected
    ) || null;
}

function compareArchiveCandidates(a, b) {
    const aMusicXml = /\.musicxml$/i.test(a.name);
    const bMusicXml = /\.musicxml$/i.test(b.name);
    if (aMusicXml !== bMusicXml) return aMusicXml ? -1 : 1;
    const aDepth = normalizeArchivePath(a.name).split("/").length;
    const bDepth = normalizeArchivePath(b.name).split("/").length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.name.localeCompare(b.name, "ja", { numeric: true });
}

async function readArchiveText(entry, label) {
    const uncompressedSize = numberValue(entry?._data?.uncompressedSize, 0);
    if (uncompressedSize > MAX_XML_CHARACTERS * 4) {
        throw new Error(`MXL内の「${label}」が大きすぎるため読み込めません。`);
    }
    const source = await entry.async("string");
    if (source.length > MAX_XML_CHARACTERS) {
        throw new Error(`MXL内の「${label}」が大きすぎるため読み込めません。`);
    }
    return source;
}

function isPartwiseMusicXml(source) {
    return /<(?:[A-Za-z_][\w.-]*:)?score-partwise(?:\s|>)/i.test(source.slice(0, 20000));
}

function loadSample() {
    try {
        const fileName = "vocal-and-piano-sample.musicxml";
        setLoadedScore("musicxml", parseMusicXML(createSampleMusicXml(), fileName), fileName);
    } catch (error) {
        showError(error.message);
    }
}

function loadSvpSample() {
    try {
        const fileName = "synthv-vocal-sample.svp";
        setLoadedScore("svp", parseSvp(createSampleSvp(), fileName), fileName);
    } catch (error) {
        showError(error.message);
    }
}

function showError(message) {
    refs.errorMessage.textContent = message;
    refs.errorMessage.hidden = false;
}

function setCurrentStep(step) {
    document.querySelectorAll(".step-pill").forEach(pill => {
        pill.classList.toggle("is-active", Number(pill.dataset.step) === step);
    });
}

function createSampleMusicXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>MusicXML Vocal Sample</work-title></work>
  <part-list>
    <score-part id="P1">
      <part-name>Vocal</part-name>
      <score-instrument id="P1-I1"><instrument-name>Voice</instrument-name></score-instrument>
    </score-part>
    <score-part id="P2">
      <part-name>Piano</part-name>
      <score-instrument id="P2-I1"><instrument-name>Piano</instrument-name></score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><sound tempo="108"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><lyric><text>こ</text></lyric></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><lyric><text>ん</text></lyric></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><lyric><text>に</text></lyric></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><lyric><text>ち</text></lyric></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>8</duration><tie type="start"/><voice>1</voice><type>half</type><lyric><text>は</text></lyric></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>8</duration><tie type="stop"/><voice>1</voice><type>half</type><lyric><extend/></lyric></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff><type>whole</type></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>2</voice><staff>2</staff><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff><type>whole</type></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>F</step><octave>3</octave></pitch><duration>16</duration><voice>2</voice><staff>2</staff><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
}

function createSampleSvp() {
    return JSON.stringify({
        version: 135,
        name: "Synthesizer V Vocal Sample",
        time: {
            meter: [{ index: 0, numerator: 4, denominator: 4 }],
            tempo: [
                { position: 0, bpm: 112 },
                { position: SVP_BLICKS_PER_QUARTER * 4, bpm: 118 }
            ]
        },
        tracks: [
            {
                name: "Lead Vocal",
                mainGroup: {
                    uuid: "sample-main",
                    name: "Main",
                    notes: [
                        { onset: 0, duration: SVP_BLICKS_PER_QUARTER, pitch: 60, lyrics: "こ" },
                        { onset: SVP_BLICKS_PER_QUARTER, duration: SVP_BLICKS_PER_QUARTER, pitch: 62, lyrics: "ん" },
                        { onset: SVP_BLICKS_PER_QUARTER * 2, duration: SVP_BLICKS_PER_QUARTER, pitch: 64, lyrics: "に" },
                        { onset: SVP_BLICKS_PER_QUARTER * 3, duration: SVP_BLICKS_PER_QUARTER, pitch: 67, lyrics: "ち" },
                        { onset: SVP_BLICKS_PER_QUARTER * 4, duration: SVP_BLICKS_PER_QUARTER * 2, pitch: 69, lyrics: "は" }
                    ]
                },
                groups: []
            },
            {
                name: "Backing Vocal",
                mainGroup: {
                    uuid: "sample-backing",
                    name: "Backing",
                    notes: [
                        { onset: 0, duration: SVP_BLICKS_PER_QUARTER * 2, pitch: 55, lyrics: "あ" },
                        { onset: SVP_BLICKS_PER_QUARTER * 2, duration: SVP_BLICKS_PER_QUARTER * 2, pitch: 57, lyrics: "+" }
                    ]
                },
                groups: []
            }
        ],
        library: []
    }, null, 2);
}

refs.musicXmlTab.addEventListener("click", () => activateSourceMode("musicxml"));
refs.svpTab.addEventListener("click", () => activateSourceMode("svp"));

refs.fileButton.addEventListener("click", event => {
    event.stopPropagation();
    refs.fileInput.click();
});
refs.sampleButton.addEventListener("click", event => {
    event.stopPropagation();
    loadSample();
});
refs.fileInput.addEventListener("change", event => loadFile(event.target.files[0]));
refs.dropZone.addEventListener("click", event => {
    if (!event.target.closest("button")) refs.fileInput.click();
});
refs.dropZone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        refs.fileInput.click();
    }
});
refs.dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    refs.dropZone.classList.add("is-dragover");
});
refs.dropZone.addEventListener("dragleave", () => refs.dropZone.classList.remove("is-dragover"));
refs.dropZone.addEventListener("drop", event => {
    event.preventDefault();
    refs.dropZone.classList.remove("is-dragover");
    loadFile(event.dataTransfer?.files?.[0]);
});

refs.svpFileButton.addEventListener("click", event => {
    event.stopPropagation();
    refs.svpFileInput.click();
});
refs.svpSampleButton.addEventListener("click", event => {
    event.stopPropagation();
    loadSvpSample();
});
refs.svpFileInput.addEventListener("change", event => loadSvpFile(event.target.files[0]));
refs.svpDropZone.addEventListener("click", event => {
    if (!event.target.closest("button")) refs.svpFileInput.click();
});
refs.svpDropZone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        refs.svpFileInput.click();
    }
});
refs.svpDropZone.addEventListener("dragover", event => {
    event.preventDefault();
    refs.svpDropZone.classList.add("is-dragover");
});
refs.svpDropZone.addEventListener("dragleave", () => refs.svpDropZone.classList.remove("is-dragover"));
refs.svpDropZone.addEventListener("drop", event => {
    event.preventDefault();
    refs.svpDropZone.classList.remove("is-dragover");
    loadSvpFile(event.dataTransfer?.files?.[0]);
});

refs.lyricsTrackSelect.addEventListener("change", updateLyricsTransferText);
refs.lyricsSeparatorSelect.addEventListener("change", updateLyricsTransferText);
refs.copyLyricsButton.addEventListener("click", copyLyricsToClipboard);

[
    refs.transposeInput,
    refs.defaultLyricInput,
    refs.chordPolicySelect,
    refs.defaultTempoInput,
    refs.expandRepeatsInput,
    refs.mergeTiesInput,
    refs.trimOverlapsInput
].forEach(control => {
    control.addEventListener(control.type === "text" || control.type === "number" ? "input" : "change", updatePreview);
});

refs.exportButton.addEventListener("click", downloadVsqx);
window.addEventListener("resize", () => {
    if (state.preview) drawPianoRoll(state.preview);
});

activateSourceMode("musicxml");
