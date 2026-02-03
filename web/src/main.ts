// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Player } from "./player.ts";
import { Recorder } from "./recorder.ts";
import "./style.css";
import { LowLevelRTClient, SessionUpdateMessage, Voice } from "rt-client";

let realtimeStreaming: LowLevelRTClient;
let audioRecorder: Recorder;
let audioPlayer: Player;

const azureEndpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT || '';
const azureDeployment = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT || '';
const azureApiKey = import.meta.env.VITE_AZURE_OPENAI_API_KEY || '';

async function start_realtime(endpoint: string, apiKey: string, deploymentOrModel: string) {
  if (isAzureOpenAI()) {
    endpoint = endpoint || azureEndpoint;
    apiKey = apiKey || azureApiKey;
    deploymentOrModel = deploymentOrModel || azureDeployment;

    if (!endpoint || !deploymentOrModel || !apiKey) {
      throw new Error("Azure OpenAI endpoint, deployment, and API key are required.");
    }

    realtimeStreaming = new LowLevelRTClient(new URL(endpoint), { key: apiKey }, { deployment: deploymentOrModel });
  } else {
    if (!apiKey || !deploymentOrModel) {
      throw new Error("OpenAI API key and model are required.");
    }

    realtimeStreaming = new LowLevelRTClient({ key: apiKey }, { model: deploymentOrModel });
  }

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

function createConfigMessage(): SessionUpdateMessage {

  let configMessage: SessionUpdateMessage = {
    type: "session.update",
    session: {
      turn_detection: {
        type: "server_vad",
        threshold: 0.6,
        prefix_padding_ms: 400,
        silence_duration_ms: 700
      },
      input_audio_transcription: {
        model: "whisper-1"
      }
    }
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
      case "response.audio.delta":
        const binary = atob(message.delta);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const pcmData = new Int16Array(bytes.buffer);
        audioPlayer.play(pcmData);
        break;

      case "input_audio_buffer.speech_started":
        makeNewTextBlock("<< Speech Started >>");
        let textElements = formReceivedTextContainer.children;
        latestInputSpeechBlock = textElements[textElements.length - 1];
        makeNewTextBlock();
        audioPlayer.clear();
        break;
      case "conversation.item.input_audio_transcription.completed":
        latestInputSpeechBlock.textContent += " User: " + message.transcript;
        break;
      case "response.done":
        formReceivedTextContainer.appendChild(document.createElement("hr"));
        break;
      default:
        consoleLog = JSON.stringify(message, null, 2);
        break
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

let recordingActive: boolean = false;
let buffer: Uint8Array = new Uint8Array();

function combineArray(newData: Uint8Array) {
  const newBuffer = new Uint8Array(buffer.length + newData.length);
  newBuffer.set(buffer);
  newBuffer.set(newData, buffer.length);
  buffer = newBuffer;
}

function processAudioRecordingBuffer(data: Buffer) {
  const uint8Array = new Uint8Array(data);
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

async function resetAudio(startRecording: boolean) {
  recordingActive = false;
  if (audioRecorder) {
    audioRecorder.stop();
  }
  if (audioPlayer) {
    audioPlayer.clear();
  }
  audioRecorder = new Recorder(processAudioRecordingBuffer);
  audioPlayer = new Player();
  audioPlayer.init(24000);
  if (startRecording) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioRecorder.start(stream);
    recordingActive = true;
  }
}

/**
 * UI and controls
 */

const formReceivedTextContainer = document.querySelector<HTMLDivElement>(
  "#received-text-container",
)!;
const formStartButton =
  document.querySelector<HTMLButtonElement>("#start-recording")!;
const formStopButton =
  document.querySelector<HTMLButtonElement>("#stop-recording")!;
const formClearAllButton =
  document.querySelector<HTMLButtonElement>("#clear-all")!;
const formEndpointField =
  document.querySelector<HTMLInputElement>("#endpoint")!;
const formAzureToggle =
  document.querySelector<HTMLInputElement>("#azure-toggle")!;
const formApiKeyField = document.querySelector<HTMLInputElement>("#api-key")!;
const formDeploymentOrModelField = document.querySelector<HTMLInputElement>("#deployment-or-model")!;
const formSessionInstructionsField =
  document.querySelector<HTMLTextAreaElement>("#session-instructions")!;
const formTemperatureField = document.querySelector<HTMLInputElement>("#temperature")!;
const formVoiceSelection = document.querySelector<HTMLInputElement>("#voice")!;

let latestInputSpeechBlock: Element;

enum InputState {
  Working,
  ReadyToStart,
  ReadyToStop,
}

function isAzureOpenAI(): boolean {
  return formAzureToggle.checked;
}

function guessIfIsAzureOpenAI() {
  const endpoint = (formEndpointField.value || azureEndpoint || "").trim();
  formAzureToggle.checked = endpoint.indexOf('azure') > -1;
}

function setInitialValues() {
  if (azureEndpoint) formEndpointField.value = azureEndpoint;
  if (azureDeployment) formDeploymentOrModelField.value = azureDeployment;
  if (azureApiKey) formApiKeyField.value = azureApiKey;
  guessIfIsAzureOpenAI();
}

function setFormInputState(state: InputState) {
  formEndpointField.disabled = state != InputState.ReadyToStart;
  formApiKeyField.disabled = state != InputState.ReadyToStart;
  formDeploymentOrModelField.disabled = state != InputState.ReadyToStart;
  formStartButton.disabled = state != InputState.ReadyToStart;
  formStopButton.disabled = state != InputState.ReadyToStop;
  formSessionInstructionsField.disabled = state != InputState.ReadyToStart;
  formAzureToggle.disabled = state != InputState.ReadyToStart;
}

function getSystemMessage(): string {
  return formSessionInstructionsField.value || "";
}

function getTemperature(): number {
  return parseFloat(formTemperatureField.value);
}

function getVoice(): Voice {
  return formVoiceSelection.value as Voice;
}

function makeNewTextBlock(text: string = "") {
  let newElement = document.createElement("p");
  newElement.textContent = text;
  formReceivedTextContainer.appendChild(newElement);
  scrollToBottom();
}

function appendToTextBlock(text: string) {
  let textElements = formReceivedTextContainer.children;
  if (textElements.length == 0) {
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

  let endpoint = formEndpointField.value.trim() || azureEndpoint;
  let key = formApiKeyField.value.trim() || azureApiKey;
  let deploymentOrModel = formDeploymentOrModelField.value.trim() || azureDeployment;

  if (isAzureOpenAI() && (!endpoint || !deploymentOrModel)) {
    alert("Endpoint and Deployment are required for Azure OpenAI");
    setFormInputState(InputState.ReadyToStart);
    return;
  }

  if (!isAzureOpenAI() && !deploymentOrModel) {
    alert("Model is required for OpenAI");
    setFormInputState(InputState.ReadyToStart);
    return;
  }

  if (!key) {
    alert("API Key is required");
    setFormInputState(InputState.ReadyToStart);
    return;
  }

  try {
    await start_realtime(endpoint, key, deploymentOrModel);
  } catch (error: unknown) {
    console.log(error);
    if (error instanceof Error) {
      makeNewTextBlock(`[Error]: ${error.message}`);
    } else {
      makeNewTextBlock('[Error]: An unknown error occurred');
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

formEndpointField.addEventListener('change', async () => {
  guessIfIsAzureOpenAI();
});
setInitialValues();
guessIfIsAzureOpenAI();
const formReduceInterruptionsButton =
  document.querySelector<HTMLButtonElement>("#reduce-interruptions")!;

const formInterviewModeButton =
  document.querySelector<HTMLButtonElement>("#interview-mode")!;

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
  • Behavioral/Situational
  • Technical/Knowledge-based
  • Company/Culture fit
  • Role-specific scenarios
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
