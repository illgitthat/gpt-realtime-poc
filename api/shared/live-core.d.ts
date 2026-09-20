interface LiveEnvironment {
  AZURE_OPENAI_BASE_URL?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_DEPLOYMENT_NAME?: string;
  AZURE_OPENAI_REASONING_DEPLOYMENT_NAME?: string;
}

interface LiveConnection {
  session: { id: string };
  transport: { type: "webrtc"; sdp: string };
}

declare class RequestError extends Error {
  constructor(message: string, status?: number);
  status: number;
}

declare const liveCore: {
  MAX_REQUEST_BYTES: number;
  RequestError: typeof RequestError;
  createLiveSession(options: {
    payload: unknown;
    env: LiveEnvironment;
    signal?: AbortSignal;
  }): Promise<LiveConnection>;
  readJsonRequest(request: Request): Promise<unknown>;
  errorResponse(error: unknown): { status: number; body: { error: string } };
};

export default liveCore;
