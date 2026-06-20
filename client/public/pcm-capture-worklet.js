/* global AudioWorkletProcessor, sampleRate, registerProcessor */

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.ratio = sampleRate / this.targetRate;
    this.nextOutputAt = 0;
    this.inputIndex = 0;
    this.previousSample = 0;
    this.output = new Int16Array(1600); // 100 ms at 16 kHz
    this.outputIndex = 0;
  }

  pushSample(sample) {
    const clamped = Math.max(-1, Math.min(1, sample));
    this.output[this.outputIndex] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    this.outputIndex += 1;
    if (this.outputIndex === this.output.length) {
      const buffer = this.output.buffer;
      this.port.postMessage(buffer, [buffer]);
      this.output = new Int16Array(1600);
      this.outputIndex = 0;
    }
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input?.length) return true;

    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      while (this.nextOutputAt <= this.inputIndex) {
        const fraction = this.inputIndex === 0
          ? 1
          : this.nextOutputAt - (this.inputIndex - 1);
        this.pushSample(this.previousSample + ((current - this.previousSample) * fraction));
        this.nextOutputAt += this.ratio;
      }
      this.previousSample = current;
      this.inputIndex += 1;
    }
    return true;
  }
}

registerProcessor('ameet-pcm-capture', PcmCaptureProcessor);
