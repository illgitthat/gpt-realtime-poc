import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

// Run only in a test tab. The app itself has no recording or fake-microphone code.
const [command, argument, session = "voice-audio-test"] = process.argv.slice(2);
const bridgeUrl = process.env.KIMI_BRIDGE_URL || "http://127.0.0.1:10086";

async function bridge(action, args) {
  const response = await fetch(`${bridgeUrl}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args, session }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error?.message || "Browser bridge failed.");
  return result.data;
}

async function evaluate(expression) {
  const result = await bridge("cdp", {
    method: "Runtime.evaluate",
    params: { expression, userGesture: true, awaitPromise: true, returnByValue: true },
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

function installHarness() {
  if (window.__voiceTest) throw new Error("Test harness is already installed. Reload the test tab first.");
  const test = window.__voiceTest = { events: [], peers: [], captures: [], recordings: [], started: performance.now() };
  const originalPeer = window.RTCPeerConnection;
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async () => {
    const context = new AudioContext();
    await context.resume();
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    const capture = { context, destination, oscillator };
    test.captures.push(capture);
    return destination.stream;
  };
  window.RTCPeerConnection = class extends originalPeer {
    constructor(...args) {
      super(...args);
      const index = test.peers.push(this) - 1;
      this.addEventListener("track", ({ track }) => {
        const stream = new MediaStream([track]);
        const recorder = new MediaRecorder(stream);
        const recording = { recorder, chunks: [], peer: index };
        test.recordings.push(recording);
        recorder.addEventListener("dataavailable", event => {
          if (event.data.size) recording.chunks.push(event.data);
        });
        recorder.start(1000);
      });
      this.addEventListener("connectionstatechange", () => {
        test.events.push({ type: "connection", state: this.connectionState, peer: index, at: performance.now() - test.started });
      });
    }
    createDataChannel(...args) {
      const channel = super.createDataChannel(...args);
      channel.addEventListener("close", () => {
        test.events.push({ type: "channel.closed", at: performance.now() - test.started });
      });
      channel.addEventListener("error", () => {
        test.events.push({ type: "channel.error", at: performance.now() - test.started });
      });
      channel.addEventListener("message", ({ data }) => {
        const event = JSON.parse(data);
        let safe;
        if (event.type === "response.event") {
          const nested = event.event;
          if (nested.type === "response.completed" || nested.type === "response.failed" || nested.type === "response.incomplete") {
            safe = { type: nested.type, id: nested.response?.id, model: nested.response?.model, usage: nested.response?.usage, error: nested.response?.error };
          } else if (nested.type === "response.output_item.done" && nested.item?.type === "function_call") {
            safe = { type: nested.type, tool: nested.item.name, arguments: nested.item.arguments };
          }
        } else if (event.type === "session.started") {
          safe = { type: event.type, id: event.session?.id, model: event.session?.model, expires_at: event.session?.expires_at };
        } else if (event.type === "session.closed") {
          safe = { type: event.type, usage: event.usage, reason: event.reason };
        } else if (event.type.includes("transcript") || event.type.includes("error") || event.type === "session.delegation.created") {
          safe = event;
        }
        if (safe) test.events.push({ ...safe, at: performance.now() - test.started });
      });
      return channel;
    }
  };
  test.play = async base64 => {
    const capture = test.captures.at(-1);
    if (!capture || capture.context.state === "closed") throw new Error("Start a conversation before playing a fixture.");
    await capture.context.resume();
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const buffer = await capture.context.decodeAudioData(bytes.buffer);
    const source = capture.context.createBufferSource();
    source.buffer = buffer;
    source.connect(capture.destination);
    source.start();
    return { duration: buffer.duration, channels: buffer.numberOfChannels };
  };
  test.finish = async () => {
    for (const recording of test.recordings) {
      if (recording.recorder.state !== "inactive") {
        await new Promise(resolve => {
          recording.recorder.addEventListener("stop", resolve, { once: true });
          recording.recorder.stop();
        });
      }
    }
    const audio = [];
    for (const recording of test.recordings) {
      const mimeType = recording.recorder.mimeType || recording.chunks[0]?.type || "audio/webm";
      const blob = new Blob(recording.chunks, { type: mimeType });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      audio.push({ base64: btoa(binary), mimeType, bytes: bytes.length, peer: recording.peer });
    }
    const tracks = test.captures.flatMap(capture => capture.destination.stream.getTracks());
    const result = {
      events: test.events,
      audio,
      microphoneTracks: tracks.map(track => ({ readyState: track.readyState, enabled: track.enabled })),
      connections: test.peers.map(peer => peer.connectionState),
    };
    for (const capture of test.captures) {
      capture.oscillator.stop();
      capture.destination.stream.getTracks().forEach(track => track.stop());
      if (capture.context.state !== "closed") await capture.context.close();
    }
    navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    window.RTCPeerConnection = originalPeer;
    return result;
  };
  return "Audio harness ready. Start the conversation, then play a WAV fixture.";
}

if (command === "setup" && argument) {
  const url = new URL(argument);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an HTTP(S) test app URL.");
  await bridge("navigate", { url: url.href, newTab: true, group_title: "Voice audio test" });
  console.log(await evaluate(`(${installHarness.toString()})()`));
} else if (command === "play" && argument) {
  const wav = await readFile(resolve(argument));
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("Expected a WAV audio fixture.");
  console.log(await evaluate(`window.__voiceTest.play(${JSON.stringify(wav.toString("base64"))})`));
} else if (command === "status") {
  console.log(JSON.stringify(await evaluate(`({
    events: window.__voiceTest.events,
    connections: window.__voiceTest.peers.map(peer => peer.connectionState),
    microphoneTracks: window.__voiceTest.captures.flatMap(capture => capture.destination.stream.getTracks()).map(track => ({readyState:track.readyState,enabled:track.enabled}))
  })`), null, 2));
} else if (command === "save" && argument) {
  const result = await evaluate(`(async () => {
    const test = window.__voiceTest;
    test.exportResult ||= await test.finish();
    return {
      ...test.exportResult,
      audio: test.exportResult.audio.map(({base64, ...metadata}, index) => ({
        ...metadata, mimeType: metadata.mimeType || test.recordings[index].recorder.mimeType,
        encodedLength: base64.length,
      })),
    };
  })()`);
  const directory = resolve(argument);
  await mkdir(directory, { recursive: true });
  for (const [index, audio] of result.audio.entries()) {
    const extension = audio.mimeType.includes("mp4") ? "mp4" : audio.mimeType.includes("ogg") ? "ogg" : "webm";
    const path = join(directory, `response-${index + 1}.${extension}`);
    await writeFile(path, "");
    // Bound each bridge message; a long recording can exceed its WebSocket frame limit.
    const chunkSize = 512 * 1024;
    let written = 0;
    for (let offset = 0; offset < audio.encodedLength; offset += chunkSize) {
      const chunk = await evaluate(`window.__voiceTest.exportResult.audio[${index}].base64.slice(${offset}, ${offset + chunkSize})`);
      if (typeof chunk !== "string" || chunk.length !== Math.min(chunkSize, audio.encodedLength - offset)) {
        throw new Error("The browser bridge returned an incomplete recording chunk.");
      }
      const bytes = Buffer.from(chunk, "base64");
      await appendFile(path, bytes);
      written += bytes.length;
    }
    if (written !== audio.bytes) throw new Error("The saved recording length does not match the browser recording.");
    delete audio.encodedLength;
  }
  await writeFile(join(directory, "results.json"), JSON.stringify(result, null, 2) + "\n");
  await evaluate("delete window.__voiceTest.exportResult; true");
  console.log(`Saved ${result.audio.length} response recording(s) and results to ${directory}`);
} else {
  console.log(`Kimi browser audio test harness (no production test hooks).
  node test/audio-harness.mjs setup <test-app-url> [kimi-session]
  node test/audio-harness.mjs play <fixture.wav> [kimi-session]
  node test/audio-harness.mjs status - [kimi-session]
  node test/audio-harness.mjs save <output-directory> [kimi-session]

After setup, start the app with a user gesture. Play one or more synthetic WAV
fixtures. End the conversation BEFORE save to check that the app released the
microphone and connection. Save writes captured output and sanitized events.
Use generated speech only; recordings remain in the chosen local directory.`);
  process.exitCode = command ? 1 : 0;
}
