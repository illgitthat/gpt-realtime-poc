import { Player } from "./player.js";
import { Recorder } from "./recorder.js";
import { LowLevelRTClient } from "./vendor/rt-client.js";

let realtimeStreaming;
let audioRecorder;
let audioPlayer;

const appConfig = window.__APP_CONFIG__ || {};
const azureEndpoint = appConfig.azureEndpoint || "";
const azureDeployment = appConfig.azureDeployment || "";
let cachedAzureToken = null;

async function fetchAzureToken() {
  if (
    cachedAzureToken &&
    cachedAzureToken.expiresOnTimestamp &&
    cachedAzureToken.expiresOnTimestamp - Date.now() > 60000
  ) {
    return cachedAzureToken;
  }

  const response = await fetch("/token");
  if (!response.ok) {
    throw new Error("Unable to fetch Azure AD token.");
  }
  const data = await response.json();
  if (!data || !data.token) {
    throw new Error("Token response missing token.");
  }
  cachedAzureToken = {
    token: data.token,
    expiresOnTimestamp:
      data.expiresOnTimestamp || Date.now() + 30 * 60 * 1000,
  };
  return cachedAzureToken;
}

function createAzureTokenCredential() {
  return {
    getToken: async () => fetchAzureToken(),
  };
}

async function start_realtime(endpoint, deploymentOrModel) {
  endpoint = endpoint || azureEndpoint;
  deploymentOrModel = deploymentOrModel || azureDeployment;

  if (!endpoint || !deploymentOrModel) {
    throw new Error("Azure OpenAI endpoint and deployment are required.");
  }

  const credential = createAzureTokenCredential();
  realtimeStreaming = new LowLevelRTClient(
    new URL(endpoint),
    credential,
    { deployment: deploymentOrModel },
  );

  try {
    console.log("sending session config");
    await realtimeStreaming.send(createConfigMessage());
  } catch (error) {
    console.log(error);
    makeNewTextBlock("[Connection error]: Unable to send initial config message. Please check your endpoint and authentication details.");
    setFormInputState(InputState.ReadyToStart);
    return;
  }
  console.log("sent");
  await Promise.all([resetAudio(true), handleRealtimeMessages()]);
}

function createConfigMessage() {
  const configMessage = {
    type: "session.update",
    session: {
      turn_detection: {
        type: "server_vad",
        threshold: 0.6,
        prefix_padding_ms: 400,
        silence_duration_ms: 700,
      },
      input_audio_transcription: {
        model: "whisper-1",
      },
    },
  };

  const systemMessage = getSystemMessage();
  const temperature = getTemperature();
  const voice = getVoice();

  if (systemMessage) {
    configMessage.session.instructions = systemMessage;
  }
  if (!isNaN(temperature)) {
    configMessage.session.temperature = temperature;
  }
  if (voice) {
    configMessage.session.voice = voice;
  }

  return configMessage;
}

async function handleRealtimeMessages() {
  for await (const message of realtimeStreaming.messages()) {
    let consoleLog = "" + message.type;

    switch (message.type) {
      case "session.created":
        setFormInputState(InputState.ReadyToStop);
        makeNewTextBlock("<< Session Started >>");
        makeNewTextBlock();
        break;
      case "response.audio_transcript.delta":
        appendToTextBlock(message.delta);
        break;
      case "response.audio.delta": {
        const binary = atob(message.delta);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const pcmData = new Int16Array(bytes.buffer);
        audioPlayer.play(pcmData);
        break;
      }
      case "input_audio_buffer.speech_started":
        makeNewTextBlock("<< Speech Started >>");
        {
          const textElements = formReceivedTextContainer.children;
          latestInputSpeechBlock = textElements[textElements.length - 1];
          makeNewTextBlock();
          audioPlayer.clear();
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        latestInputSpeechBlock.textContent += " User: " + message.transcript;
        break;
      case "response.done":
        formReceivedTextContainer.appendChild(document.createElement("hr"));
        break;
      default:
        consoleLog = JSON.stringify(message, null, 2);
        break;
    }
    if (consoleLog) {
      console.log(consoleLog);
    }
  }
  resetAudio(false);
}

/**
 * Basic audio handling
 */

let recordingActive = false;
let buffer = new Uint8Array();

function combineArray(newData) {
  const newBuffer = new Uint8Array(buffer.length + newData.length);
  newBuffer.set(buffer);
  newBuffer.set(newData, buffer.length);
  buffer = newBuffer;
}

function processAudioRecordingBuffer(data) {
  if (!data) {
    return;
  }

  let uint8Array;
  if (data instanceof ArrayBuffer) {
    uint8Array = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    uint8Array = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else {
    return;
  }

  combineArray(uint8Array);
  if (buffer.length >= 4800) {
    const toSend = new Uint8Array(buffer.slice(0, 4800));
    buffer = new Uint8Array(buffer.slice(4800));
    const regularArray = String.fromCharCode(...toSend);
    const base64 = btoa(regularArray);
    if (recordingActive) {
      realtimeStreaming.send({
        type: "input_audio_buffer.append",
        audio: base64,
      });
    }
  }
}

async function resetAudio(startRecording) {
  recordingActive = false;
  if (audioRecorder) {
    audioRecorder.stop();
  }
  if (audioPlayer) {
    audioPlayer.clear();
  }
  audioRecorder = new Recorder(processAudioRecordingBuffer);
  audioPlayer = new Player();
  await audioPlayer.init(24000);
  if (startRecording) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await audioRecorder.start(stream);
    recordingActive = true;
  }
}

/**
 * UI and controls
 */

const formReceivedTextContainer = document.querySelector(
  "#received-text-container",
);
const formStartButton =
  document.querySelector("#start-recording");
const formStopButton =
  document.querySelector("#stop-recording");
const formClearAllButton =
  document.querySelector("#clear-all");
const formEndpointField =
  document.querySelector("#endpoint");
const formDeploymentOrModelField = document.querySelector("#deployment-or-model");
const formSessionInstructionsField =
  document.querySelector("#session-instructions");
const formTemperatureField = document.querySelector("#temperature");
const formVoiceSelection = document.querySelector("#voice");

let latestInputSpeechBlock;

const InputState = {
  Working: "Working",
  ReadyToStart: "ReadyToStart",
  ReadyToStop: "ReadyToStop",
};

function setInitialValues() {
  if (azureEndpoint) formEndpointField.value = azureEndpoint;
  if (azureDeployment) formDeploymentOrModelField.value = azureDeployment;
}

function setFormInputState(state) {
  formEndpointField.disabled = state !== InputState.ReadyToStart;
  formDeploymentOrModelField.disabled = state !== InputState.ReadyToStart;
  formStartButton.disabled = state !== InputState.ReadyToStart;
  formStopButton.disabled = state !== InputState.ReadyToStop;
  formSessionInstructionsField.disabled = state !== InputState.ReadyToStart;
}

function getSystemMessage() {
  return formSessionInstructionsField.value || "";
}

function getTemperature() {
  return parseFloat(formTemperatureField.value);
}

function getVoice() {
  return formVoiceSelection.value;
}

function makeNewTextBlock(text = "") {
  const newElement = document.createElement("p");
  newElement.textContent = text;
  formReceivedTextContainer.appendChild(newElement);
  scrollToBottom();
}

function appendToTextBlock(text) {
  const textElements = formReceivedTextContainer.children;
  if (textElements.length === 0) {
    makeNewTextBlock();
  }
  textElements[textElements.length - 1].textContent += text;
  scrollToBottom();
}

function scrollToBottom() {
  formReceivedTextContainer.scrollTop = formReceivedTextContainer.scrollHeight;
}

formStartButton.addEventListener("click", async () => {
  setFormInputState(InputState.Working);

  const endpoint = formEndpointField.value.trim() || azureEndpoint;
  const deploymentOrModel = formDeploymentOrModelField.value.trim() || azureDeployment;

  if (!endpoint || !deploymentOrModel) {
    alert("Endpoint and Deployment are required for Azure OpenAI");
    setFormInputState(InputState.ReadyToStart);
    return;
  }

  try {
    await start_realtime(endpoint, deploymentOrModel);
  } catch (error) {
    console.log(error);
    if (error instanceof Error) {
      makeNewTextBlock(`[Error]: ${error.message}`);
    } else {
      makeNewTextBlock("[Error]: An unknown error occurred");
    }
    setFormInputState(InputState.ReadyToStart);
  }
});

formStopButton.addEventListener("click", async () => {
  setFormInputState(InputState.Working);
  resetAudio(false);
  realtimeStreaming.close();
  setFormInputState(InputState.ReadyToStart);
});

formClearAllButton.addEventListener("click", async () => {
  formReceivedTextContainer.innerHTML = "";
});

setInitialValues();
const formReduceInterruptionsButton =
  document.querySelector("#reduce-interruptions");

const formInterviewModeButton =
  document.querySelector("#interview-mode");

// Define system prompt for "Reduce Interruptions"
const reduceInterruptionsSystemPrompt = `You are an empathetic listener. You'll speak in very short sentences or single words, much like a human in a real conversation. Also, the user may speak and have incomplete thoughts. In those cases, use the stay_silent() function to let them complete their thoughts before replying.

If the user says
- something inaudible
- an incomplete sentence
- an incomplete thought

OR

if they are going on a bit of a monologue or extended, meandering thought, let them finish. be kind.

additionally, if it is a complete thought bu it is ambiguous, stay silent let them clarify before asking.

e.g. "can you show me" (let them specify what)

e.g.
"No, yeah doing um"
"maybe..."
"I really don't want it." (let the user finish this thought)

or just
[inaudible]...

"Good, I need to ask you a couple things. First I want to ask you" (this is incomplete)
"So tell me something" (also incomplete)

for those you should all wait. use this function liberally. the user appreciates when you wait
"""

function:
"""
{
  "name": "stay_silent",
  "description": "Use this function to give the user an opportunity to finish their thought.",
  "parameters": {
    "type": "object",
    "properties": {},
    "required": []
  }
}`;

formReduceInterruptionsButton.addEventListener("click", () => {
  formSessionInstructionsField.value = reduceInterruptionsSystemPrompt;
});
// Define system prompt for "Reduce Interruptions"
const interviewModeSystemPrompt = `You are an experienced interview coach specializing in professional career development and interview preparation. Your role is to:

1. Conduct realistic mock interviews that simulate actual hiring scenarios
2. Ask questions relevant to both the specific role and company culture
3. Evaluate responses based on:
   - Content clarity and completeness
   - Professional communication style
   - Alignment with industry standards
   - STAR method usage for behavioral questions
   - Technical accuracy for knowledge-based questions

Before beginning the interview:
- Confirm the target role and company
- Ask about their experience level and interview goals
- Explain that you'll conduct a [X]-minute interview session
- Inform them you'll provide real-time feedback after each response

During the interview:
- Mix different question types:
  - Behavioral/Situational
  - Technical/Knowledge-based
  - Company/Culture fit
  - Role-specific scenarios
- Maintain a professional yet supportive tone
- Allow appropriate response time
- Note both verbal content and communication style

For each response, provide structured feedback on:
- Strengths demonstrated
- Areas for improvement
- Specific suggestions for enhancement
- Tips for better question handling`;

formInterviewModeButton.addEventListener("click", () => {
  formSessionInstructionsField.value = interviewModeSystemPrompt;
});
