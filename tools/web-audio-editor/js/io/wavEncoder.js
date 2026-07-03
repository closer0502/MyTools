import { clamp } from "../utils/math.js";

export function encodeWav(buffer, bitDepth = 16) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;
    const isFloat = bitDepth === "32f";
    const normalizedBitDepth = isFloat ? 32 : bitDepth === 24 ? 24 : 16;
    const bytesPerSample = isFloat ? 4 : normalizedBitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const dataSize = samples * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, isFloat ? 3 : 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, normalizedBitDepth, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    let offset = 44;
    const channelData = [];
    for (let channel = 0; channel < channels; channel += 1) {
        channelData.push(buffer.getChannelData(channel));
    }
    for (let i = 0; i < samples; i += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
            const sample = clamp(channelData[channel][i], -1, 1);
            if (isFloat) {
                view.setFloat32(offset, sample, true);
                offset += 4;
            } else if (normalizedBitDepth === 24) {
                const intSample = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
                view.setUint8(offset, intSample & 0xff);
                view.setUint8(offset + 1, (intSample >> 8) & 0xff);
                view.setUint8(offset + 2, (intSample >> 16) & 0xff);
                offset += 3;
            } else {
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
                offset += 2;
            }
        }
    }
    return new Blob([view], { type: "audio/wav" });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i += 1) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
