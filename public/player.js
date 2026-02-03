export class Player {
  constructor() {
    this.playbackNode = null;
  }

  async init(sampleRate) {
    const audioContext = new AudioContext({ sampleRate });
    const workletUrl = new URL("./playback-worklet.js", import.meta.url);
    await audioContext.audioWorklet.addModule(workletUrl);

    this.playbackNode = new AudioWorkletNode(audioContext, "playback-worklet");
    this.playbackNode.connect(audioContext.destination);
  }

  play(buffer) {
    if (this.playbackNode) {
      this.playbackNode.port.postMessage(buffer);
    }
  }

  clear() {
    if (this.playbackNode) {
      this.playbackNode.port.postMessage(null);
    }
  }
}
