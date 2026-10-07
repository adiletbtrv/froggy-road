class AudioManager {
    constructor() {
        this.ctx = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.musicRaf = null;
        this.isMuted = false;
        this.nextNoteTime = 0;
        this.currentStep = 0;
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.12;
        this.musicGain.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.45;
        this.sfxGain.connect(this.ctx.destination);
    }

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.ctx) {
            this.musicGain.gain.value = this.isMuted ? 0 : 0.12;
            this.sfxGain.gain.value = this.isMuted ? 0 : 0.45;
        }
        document.getElementById('sound-on').style.display = this.isMuted ? 'none' : 'block';
        document.getElementById('sound-off').style.display = this.isMuted ? 'block' : 'none';
    }

    /* --- Звуковые эффекты (SFX) --- */
    playHop() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(420, t);
        o.frequency.exponentialRampToValueAtTime(860, t + 0.09);
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        o.connect(g); g.connect(this.sfxGain);
        o.start(t); o.stop(t + 0.11);
    }

    playScore() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(660, t);
        o.frequency.setValueAtTime(880, t + 0.06);
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g); g.connect(this.sfxGain);
        o.start(t); o.stop(t + 0.14);
    }

    playPickup() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
        const g1 = this.ctx.createGain(), g2 = this.ctx.createGain();
        o1.type = 'sine'; o2.type = 'sine';
        o1.frequency.setValueAtTime(880, t);
        o1.frequency.exponentialRampToValueAtTime(1320, t + 0.07);
        o2.frequency.setValueAtTime(1320, t + 0.07);
        o2.frequency.exponentialRampToValueAtTime(1760, t + 0.14);
        g1.gain.setValueAtTime(0.15, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        g2.gain.setValueAtTime(0.15, t + 0.07); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o1.connect(g1); g1.connect(this.sfxGain); o2.connect(g2); g2.connect(this.sfxGain);
        o1.start(t); o1.stop(t + 0.1); o2.start(t + 0.07); o2.stop(t + 0.18);
    }

    playHit() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.18, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const n = this.ctx.createBufferSource(); n.buffer = buf;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.55, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        n.connect(ng); ng.connect(this.sfxGain); n.start(t); n.stop(t + 0.18);
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(35, t + 0.15);
        g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.15);
    }

    playSplash() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.28, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const n = this.ctx.createBufferSource(); n.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        n.connect(f); f.connect(g); g.connect(this.sfxGain); n.start(t); n.stop(t + 0.28);
        const o = this.ctx.createOscillator(), og = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(300, t + 0.05);
        o.frequency.exponentialRampToValueAtTime(600, t + 0.15);
        og.gain.setValueAtTime(0.12, t + 0.05); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(og); og.connect(this.sfxGain); o.start(t + 0.05); o.stop(t + 0.2);
    }

    /* --- Музыка: Планировщик с упреждением (на базе RAF) --- */
    startMusic() {
        if (!this.ctx || this.musicRaf) return;
        
        const bpm = 130;
        const step = 60 / bpm;
        const melody = [
            {f:523.25,d:1},{f:587.33,d:1},{f:659.25,d:1},{f:783.99,d:2},
            {f:659.25,d:1},{f:523.25,d:1},{f:783.99,d:2},{f:0,d:2},
            {f:880.00,d:1},{f:783.99,d:1},{f:659.25,d:1},{f:587.33,d:2},
            {f:523.25,d:1},{f:0,d:1},{f:523.25,d:2},{f:0,d:2}
        ];
        const bass = [
            {f:130.81,d:2},{f:164.81,d:2},{f:196.00,d:2},{f:130.81,d:2},
            {f:130.81,d:2},{f:164.81,d:2},{f:196.00,d:2},{f:130.81,d:2}
        ];

        this.nextNoteTime = this.ctx.currentTime + 0.05;
        this.currentStep = 0;

        const sched = (note, type, dest) => {
            if (note.f <= 0) return;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = type; o.frequency.value = note.f;
            
            // Плавная атака (10ms) + экспоненциальный спад
            g.gain.setValueAtTime(0, this.nextNoteTime);
            g.gain.linearRampToValueAtTime(0.22, this.nextNoteTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, this.nextNoteTime + step * note.d * 0.85);
            
            o.connect(g); g.connect(dest);
            o.start(this.nextNoteTime); 
            o.stop(this.nextNoteTime + step * note.d);
        };

        const schedulerLoop = () => {
            if (!this.ctx) return;
            if (this.nextNoteTime < this.ctx.currentTime) {
                this.nextNoteTime = this.ctx.currentTime + 0.05;
            }
            while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
                sched(melody[this.currentStep % melody.length], 'square', this.musicGain);
                sched(bass[this.currentStep % bass.length], 'triangle', this.musicGain);
                this.nextNoteTime += step * melody[this.currentStep % melody.length].d;
                this.currentStep++;
            }
            this.musicRaf = requestAnimationFrame(schedulerLoop);
        };
        schedulerLoop();
    }

    stopMusic() {
        if (this.musicRaf) { cancelAnimationFrame(this.musicRaf); this.musicRaf = null; }
    }
}

const audio = new AudioManager();