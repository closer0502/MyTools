export const outputProfiles = {
    wav: { ext: "wav", mime: "audio/wav", codec: null, bitrate: false },
    mp3: { ext: "mp3", mime: "audio/mpeg", codec: ["-c:a", "libmp3lame"], bitrate: true },
    m4a: { ext: "m4a", mime: "audio/mp4", codec: ["-c:a", "aac"], bitrate: true },
    ogg: { ext: "ogg", mime: "audio/ogg", codec: ["-c:a", "libopus"], bitrate: true },
    flac: { ext: "flac", mime: "audio/flac", codec: ["-c:a", "flac"], bitrate: false },
};
