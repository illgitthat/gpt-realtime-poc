export class Recorder {
  constructor(onDataAvailable) {
    this.onDataAvailable = onDataAvailable;
    this.audioContext = null;
    this.mediaStream = null;
    this.mediaStreamSource = null;
    this.workletNode = null;
  }

  async start(stream) {
    try {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      const workletUrl = new URL("./audio-worklet-processor.js", import.meta.url);
      await this.audioContext.audioWorklet.addModule(workletUrl);
      this.mediaStream = stream;
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "audio-worklet-processor",
      );
      this.workletNode.port.onmessage = (event) => {
        const data = event.data && event.data.buffer ? event.data.buffer : event.data;
        this.onDataAvailable(data);
      };
      this.mediaStreamSource.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
    } catch (error) {
      this.stop();
    }
  }

  stop() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
