# https://closer0502.github.io/MyTools/

- audio-chopper: splits local audio with draggable waveform markers, overview/zoom navigation, region preview, editable names/times, selection, undo/redo, 16-bit WAV export and selected-region ZIP export. A shared fade-in/out duration is specified in milliseconds (default 0); each edge is capped at half the region length and also applied to preview. Audio is decoded locally using the browser-supported formats; output uses the decoded sample rate and channel count. JSZip 3.10.1 is bundled under the MIT license and loaded locally only for ZIP export (see `tools/audio-chopper/vendor/JSZip-LICENSE.md`). Open `tools/audio-chopper/index.html`; run `node --test tools/audio-chopper/core.test.js`.

- pixel-art-cleaner: restores a square pixel grid with manual offsets and approximate grid detection, center/dominant/average sampling, palette reduction with fixed or custom colors, binary transparency, integer zoom, and native/scaled PNG export. Uses the shared root stylesheet and local Canvas processing without JavaScript dependencies. Open `tools/pixel-art-cleaner/index.html` directly; run core regression checks with `node --test tools/pixel-art-cleaner/core.test.js`. Grid detection assumes globally uniform spacing; local AI distortions are not automatically repaired. Non-center sampling uses up to 8×8 samples per cell. Fixed colors remain palette candidates but may not occur in the final image; alpha is not counted as a color.

- sprite-sheet-preview: previews local sprite sheets with equal grid slicing, row/range playback, frame stepping, 1–60 FPS, loop/once playback, zoom, and transparency backgrounds. Uses the shared root stylesheet and requires no external JavaScript libraries.

- pitch-shifter: uses SoundTouchJS (LGPL-2.1) via jsDelivr CDN for real-time pitch shifting while keeping tempo.
- video-frame-capture: extracts frames from local videos to PNG/JPEG/WebP and bundles ranges as ZIP using JSZip via jsDelivr CDN.
- video-audio-extractor: extracts selected audio ranges from local videos using ffmpeg.wasm via jsDelivr CDN.
- musicxml-vsqx-converter: converts selected tracks from MusicXML, compressed MXL, or Synthesizer V SVP into VSQX 4; it preserves melody, lyrics, tempo, and time signatures while intentionally omitting singer-specific parameters.
- wavetable-synth: draws cyclic synth waveforms with editable Bezier control points, previews them from a virtual keyboard, and exports a rendered WAV locally.
