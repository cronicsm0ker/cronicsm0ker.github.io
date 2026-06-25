// sensors.js — opt-in, on-device sensing. Two channels:
//
//  1) Heart rate via Web Bluetooth (standard GATT `heart_rate` service 0x180D).
//     Works with real BLE chest straps / watches that expose the profile.
//
//  2) Ambient sound LEVEL via Web Audio (microphone RMS / dB-ish loudness).
//     IMPORTANT: this measures loudness only. It does NOT record audio, does
//     NOT transcribe, stores no waveform, and sends nothing anywhere. The only
//     value kept is a single number (0..1) per sample. This is a deliberate
//     privacy choice — continuous *content* capture of a microphone is neither
//     appropriate nor permitted on the platforms this would ship to.
//
// Both channels are simulated gracefully when hardware/permission is absent so
// the rest of the app is fully demonstrable.

export class HeartRateSensor {
  constructor(onSample) {
    this.onSample = onSample;
    this.device = null;
    this.timer = null;
    this.simulated = false;
  }

  async connect() {
    if (!('bluetooth' in navigator)) {
      return this._simulate('Web Bluetooth unavailable — simulating');
    }
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
      });
      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const char = await service.getCharacteristic('heart_rate_measurement');
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (e) => {
        const bpm = this._parseHr(e.target.value);
        this.onSample(bpm, false);
      });
      return { ok: true, simulated: false, name: this.device.name };
    } catch (err) {
      return this._simulate('No device selected — simulating (' + err.name + ')');
    }
  }

  // HR Measurement characteristic: flags byte then 8- or 16-bit value.
  _parseHr(dataView) {
    const flags = dataView.getUint8(0);
    return flags & 0x1 ? dataView.getUint16(1, true) : dataView.getUint8(1);
  }

  _simulate(reason) {
    this.simulated = true;
    let base = 68;
    this.timer = setInterval(() => {
      // wander, with occasional "arousal" spikes for demo realism
      base += (Math.random() - 0.5) * 4;
      if (Math.random() < 0.06) base += 18;
      base = Math.max(54, Math.min(120, base));
      this.onSample(Math.round(base), true);
    }, 1500);
    return { ok: true, simulated: true, reason };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.timer = null;
  }
}

export class AmbientLevelSensor {
  constructor(onSample) {
    this.onSample = onSample;
    this.ctx = null;
    this.raf = null;
    this.stream = null;
    this.simulated = false;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return this._simulate('Microphone API unavailable — simulating');
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.ctx.createMediaStreamSource(this.stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let last = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // RMS of the centered waveform → loudness 0..1. Waveform is discarded.
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (now - last > 1000) { // throttle to 1 Hz
          last = now;
          this.onSample(Math.min(1, rms * 4), false); // single scalar only
        }
        this.raf = requestAnimationFrame(tick);
      };
      tick();
      return { ok: true, simulated: false };
    } catch (err) {
      return this._simulate('Mic permission denied — simulating (' + err.name + ')');
    }
  }

  _simulate(reason) {
    this.simulated = true;
    let level = 0.2;
    this.raf = setInterval(() => {
      level += (Math.random() - 0.5) * 0.15;
      if (Math.random() < 0.08) level += 0.3; // "noisy environment" bursts
      level = Math.max(0.02, Math.min(1, level));
      this.onSample(Number(level.toFixed(2)), true);
    }, 1500);
    return { ok: true, simulated: true, reason };
  }

  stop() {
    if (typeof this.raf === 'number') cancelAnimationFrame(this.raf);
    if (this.raf && this.simulated) clearInterval(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.raf = null;
  }
}
