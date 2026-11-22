#!/usr/bin/env python3
"""Original sine synthesis; pip install numpy. No audio samples are inputs."""
import hashlib,json,wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]/'android-launcher/res'
RATE=44100
def bell(frequency, duration, amplitude=1, warmth=1):
    t = np.arange(round(RATE * duration)) / RATE
    attack = 1 - np.exp(-t / .006)
    body = np.sin(2 * np.pi * frequency * t) * np.exp(-t / (.28 * warmth))
    body += .23 * np.sin(2 * np.pi * frequency * 2.004 * t) * np.exp(-t / (.13 * warmth))
    body += .11 * np.sin(2 * np.pi * frequency * 2.76 * t) * np.exp(-t / (.075 * warmth))
    body += .045 * np.sin(2 * np.pi * frequency * 4.13 * t) * np.exp(-t / (.05 * warmth))
    return amplitude * attack * body

def create_sound(name, duration, notes, description):
    signal = np.zeros(round(duration * RATE), dtype=np.float64)
    for start, freq, amplitude, tail in notes:
        part = bell(freq, tail, amplitude, warmth=1.22)
        i = round(start * RATE)
        end = min(len(signal), i + len(part))
        signal[i:end] += part[:end-i]
    # Small, deterministic room reflection. No source audio or sampled reverb.
    dry = signal.copy()
    for delay, gain in [(.043, .055), (.079, .032), (.137, .018)]:
        offset = round(RATE * delay)
        signal[offset:] += dry[:-offset] * gain
    # Deliberately restrained playback; no autoplay in the review page.
    signal *= .36 / max(np.max(np.abs(signal)), .001)
    fade = round(RATE * .045)
    signal[-fade:] *= np.linspace(1, 0, fade)
    signal[:90] *= np.linspace(0, 1, 90)
    pcm = np.rint(signal * 32767).astype('<i2')
    path = ROOT / 'raw' / 'clock_alarm.wav'
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(pcm.tobytes())
    return {"file": str(path.relative_to(ROOT)), "description": description,
            "duration": duration, "sample_rate": RATE, "channels": 1,
            "peak_dbfs": round(float(20*np.log10(np.max(np.abs(signal)))), 2),
            "rms_dbfs": round(float(20*np.log10(np.sqrt(np.mean(signal**2)))), 2),
            "notes": notes, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}

if __name__=="__main__":
    print(json.dumps(create_sound("daybreak",5.2,[[0, 659.25, 0.5, 1.3], [0.36, 987.77, 0.46, 1.25], [0.91, 830.61, 0.48, 1.35], [1.34, 739.99, 0.45, 1.3], [1.98, 1318.51, 0.3, 1.7], [3.05, 659.25, 0.3, 1.65], [3.42, 987.77, 0.23, 1.7]],"Original daybreak alarm"),ensure_ascii=False))
