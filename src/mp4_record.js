// CT68.A6.Doll: record a canvas to a real .mp4 (H.264) in the browser, with no server and no library.
// WebCodecs' VideoEncoder makes the H.264 frames; muxMP4() below wraps them in a plain (not fragmented)
// MP4: ftyp, moov, mdat. One video track, no sound.
//
//   const rec = await Recorder.start({ width, height, fps: 30 })   // throws if this browser cannot encode H.264
//   rec.add(canvas, seconds)    // call after each render; it keeps frames at fps, on the time given
//   const blob = await rec.stop()   // video/mp4

const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const u16 = v => [(v >>> 8) & 255, v & 255];
const str = s => Array.from(s, c => c.charCodeAt(0));
const zeros = n => new Array(n).fill(0);
function box(type, ...parts) {
  let len = 8;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  new DataView(out.buffer).setUint32(0, len);
  out.set(str(type), 4);
  let o = 8;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const full = (type, ver, flags, ...parts) => box(type, [ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].flatMap(u32);

// samples: [{ data: Uint8Array, dts, dur, key }] with dts and dur in `timescale` units; avcC: the
// AVCDecoderConfigurationRecord (WebCodecs gives it as decoderConfig.description). Returns a Blob.
export function muxMP4({ width, height, samples, avcC, timescale = 90000 }) {
  const n = samples.length;
  const total = samples.reduce((a, s) => a + s.dur, 0);
  const movieDur = Math.round(total / timescale * 1000);
  // durations, run-length coded
  const stts = [];
  for (const s of samples) {
    const last = stts[stts.length - 1];
    if (last && last[1] === s.dur) last[0]++; else stts.push([1, s.dur]);
  }
  const keys = [];
  samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
  const moov = offsets => box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieDur), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), MATRIX, zeros(24), u32(2)),
    box('trak',
      full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(movieDur), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width * 65536), u32(height * 65536)),
      box('mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(total), u16(0x55c4), u16(0)),
        full('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler'), [0]),
        box('minf',
          full('vmhd', 0, 1, zeros(8)),
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          box('stbl',
            full('stsd', 0, 0, u32(1),
              box('avc1', zeros(6), u16(1), zeros(16), u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0), u16(1),
                zeros(32), u16(0x18), u16(0xffff), box('avcC', avcC))),
            full('stts', 0, 0, u32(stts.length), stts.flatMap(([c, d]) => [...u32(c), ...u32(d)])),
            full('stss', 0, 0, u32(keys.length), keys.flatMap(u32)),
            full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
            full('stsz', 0, 0, u32(0), u32(n), samples.flatMap(s => u32(s.data.length))),
            full('stco', 0, 0, u32(n), offsets.flatMap(u32)))))));
  const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const size = moov(zeros(n)).length;
  let at = ftyp.length + size + 8;
  const offsets = samples.map(s => { const o = at; at += s.data.length; return o; });
  const mdatLen = 8 + samples.reduce((a, s) => a + s.data.length, 0);
  const mdatHead = new Uint8Array(8);
  new DataView(mdatHead.buffer).setUint32(0, mdatLen);
  mdatHead.set(str('mdat'), 4);
  return new Blob([ftyp, moov(offsets), mdatHead, ...samples.map(s => s.data)], { type: 'video/mp4' });
}

export class Recorder {
  static supported() { return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'; }

  // width and height are rounded down to even numbers. Tries H.264 High, then Main, then Baseline.
  static async start({ width, height, fps = 30, bitrate = 12e6, allowDrop = false }) {
    if (!Recorder.supported()) throw new Error('this browser has no WebCodecs');
    width &= ~1; height &= ~1;
    let config = null;
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42002a', 'avc1.42001f']) {
      const c = { codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } };
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch (e) { /* try the next */ }
    }
    if (!config) throw new Error(`this browser cannot encode H.264 at ${width}×${height}`);
    const rec = new Recorder(config, fps);
    rec.allowDrop = allowDrop;
    return rec;
  }

  constructor(config, fps) {
    this.config = config; this.fps = fps; this.width = config.width; this.height = config.height;
    this.chunks = []; this.avcC = null; this.error = null; this.frames = 0; this.dropped = 0; this.lastIndex = -1; this.t0 = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width; this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.avcC) {
          const d = meta.decoderConfig.description;
          this.avcC = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
        }
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        this.chunks.push({ data, ts: chunk.timestamp, key: chunk.type === 'key' });
      },
      error: e => { this.error = e; },
    });
    this.encoder.configure(config);
  }

  // copy the region [sx, sy, sw, sh] of src (default: all of it) as the frame for time `seconds`
  add(src, seconds, region = null) {
    if (this.error || this.encoder.state !== 'configured') return false;
    if (this.t0 === null) this.t0 = seconds;
    const index = Math.round((seconds - this.t0) * this.fps);
    if (index <= this.lastIndex) return false;                 // not yet time for the next frame
    // A5: in real-time mode (allowDrop) a backed-up encoder skips a frame; in every-frame mode the caller waits on
    // rec.ready() before rendering the next frame instead, so nothing is ever dropped
    if (this.allowDrop && this.encoder.encodeQueueSize > 30) { this.dropped++; return false; }
    this.lastIndex = index;
    const [sx, sy, sw, sh] = region || [0, 0, src.width, src.height];
    this.ctx.drawImage(src, sx, sy, sw, sh, 0, 0, this.width, this.height);
    const us = Math.round(index * 1e6 / this.fps);
    const frame = new VideoFrame(this.canvas, { timestamp: us, duration: Math.round(1e6 / this.fps) });
    this.encoder.encode(frame, { keyFrame: this.frames % (this.fps * 2) === 0 });
    frame.close();
    this.frames++;
    return true;
  }

  seconds() { return this.frames ? (this.lastIndex + 1) / this.fps : 0; }

  // A5: resolves once the encoder has at most `max` frames waiting
  async ready(max = 4) {
    while (this.encoder.state === 'configured' && this.encoder.encodeQueueSize > max) {
      await new Promise(r => this.encoder.addEventListener('dequeue', r, { once: true }));
    }
  }

  async stop() {
    if (this.encoder.state === 'configured') await this.encoder.flush();
    if (this.encoder.state !== 'closed') this.encoder.close();
    if (this.error) throw this.error;
    if (!this.chunks.length || !this.avcC) throw new Error('no frames were recorded');
    const ts = 90000, frameDur = Math.round(ts / this.fps);
    // frames come out in decode order; the browsers' H.264 encoders make no B-frames, so that is also time order
    const c = this.chunks;
    for (let i = 1; i < c.length; i++) if (c[i].ts <= c[i - 1].ts) throw new Error('the encoder reordered frames (B-frames); this muxer cannot store them');
    const samples = c.map((k, i) => {
      const dts = Math.round(k.ts * ts / 1e6);
      const next = i + 1 < c.length ? Math.round(c[i + 1].ts * ts / 1e6) : dts + frameDur;
      return { data: k.data, dts, dur: Math.max(1, next - dts), key: k.key };
    });
    if (!samples[0].key) throw new Error('the first frame is not a key frame');
    return muxMP4({ width: this.width, height: this.height, samples, avcC: this.avcC, timescale: ts });
  }
}
