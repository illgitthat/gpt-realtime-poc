// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var MessageItemType = "message";

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    if (typeof b !== "function" && b !== null)
        throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __values(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read(o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
}

function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
}

function __await(v) {
    return this instanceof __await ? (this.v = v, this) : new __await(v);
}

function __asyncGenerator(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncValues(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
var isRealtimeEvent = function (message) {
    return typeof message === "object" && message !== null && "type" in message;
};
var isServerMessageType = function (message) {
    return isRealtimeEvent(message) &&
        [
            "error",
            "session.created",
            "session.updated",
            "input_audio_buffer.committed",
            "input_audio_buffer.cleared",
            "input_audio_buffer.speech_started",
            "input_audio_buffer.speech_stopped",
            "conversation.item.created",
            "conversation.item.truncated",
            "conversation.item.deleted",
            "conversation.item.input_audio_transcription.completed",
            "conversation.item.input_audio_transcription.failed",
            "response.created",
            "response.done",
            "response.output_item.added",
            "response.output_item.done",
            "response.content_part.added",
            "response.content_part.done",
            "response.text.delta",
            "response.text.done",
            "response.audio_transcript.delta",
            "response.audio_transcript.done",
            "response.audio.delta",
            "response.audio.done",
            "response.function_call_arguments.delta",
            "response.function_call_arguments.done",
            "rate_limits.updated",
        ].includes(message.type);
};

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var sendMessage = function (socket, message) {
    if (socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("Socket is not open"));
    }
    socket.send(message);
    return Promise.resolve();
};
function getWebsocket(settings) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(settings.policy != undefined)) return [3 /*break*/, 2];
                    return [4 /*yield*/, settings.policy(settings)];
                case 1:
                    settings = _a.sent();
                    _a.label = 2;
                case 2:
                    if (settings.headers != undefined) {
                        throw new Error("Headers are not supported in the browser");
                    }
                    return [2 /*return*/, new WebSocket(settings.uri, settings.protocols)];
            }
        });
    });
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var validationSuccess = function (message) { return ({
    success: true,
    message: message,
}); };
var validationError = function (error) { return ({
    success: false,
    error: error,
}); };
var isValidatorSuccess = function (result) { return result.success; };
var WebSocketClient = /** @class */ (function () {
    function WebSocketClient(settings, handler) {
        var _this = this;
        this.closedPromise = undefined;
        this.messageQueue = [];
        this.receiverQueue = [];
        this.done = false;
        this.validate = handler.validate;
        this.serialize = handler.serialize;
        this.connectedPromise = new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
            var _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this;
                        return [4 /*yield*/, getWebsocket(settings)];
                    case 1:
                        _a.socket = _b.sent();
                        this.socket.onopen = function () {
                            _this.socket.onmessage = _this.getMessageHandler();
                            _this.closedPromise = new Promise(function (resolve) {
                                _this.socket.onclose = _this.getClosedHandler(resolve);
                            });
                            _this.socket.onerror = _this.handleError;
                            resolve();
                        };
                        this.socket.onerror = function (event) {
                            _this.error = event.error;
                            reject(event);
                        };
                        return [2 /*return*/];
                }
            });
        }); });
    }
    WebSocketClient.prototype.handleError = function (event) {
        this.error = event.error;
        while (this.receiverQueue.length > 0) {
            var _a = __read(this.receiverQueue.shift(), 2); _a[0]; var reject = _a[1];
            reject(event.error);
        }
    };
    WebSocketClient.prototype.getClosedHandler = function (closeResolve) {
        var _this = this;
        return function (_) {
            _this.done = true;
            while (_this.receiverQueue.length > 0) {
                var _a = __read(_this.receiverQueue.shift(), 2), resolve = _a[0], reject = _a[1];
                if (_this.error) {
                    reject(_this.error);
                }
                else {
                    resolve({ value: undefined, done: true });
                }
            }
            closeResolve();
        };
    };
    WebSocketClient.prototype.getMessageHandler = function () {
        var self = this;
        return function (event) {
            var result = self.validate(event);
            if (isValidatorSuccess(result)) {
                var message = result.message;
                if (self.receiverQueue.length > 0) {
                    var _a = __read(self.receiverQueue.shift(), 2), resolve = _a[0]; _a[1];
                    resolve({ value: message, done: false });
                }
                else {
                    self.messageQueue.push(message);
                }
            }
            else {
                self.error = result.error;
                self.socket.close(1000, "Unexpected message received");
            }
        };
    };
    WebSocketClient.prototype[Symbol.asyncIterator] = function () {
        var _this = this;
        return {
            next: function () {
                if (_this.error) {
                    return Promise.reject(_this.error);
                }
                else if (_this.done) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                else if (_this.messageQueue.length > 0) {
                    var message = _this.messageQueue.shift();
                    return Promise.resolve({ value: message, done: false });
                }
                else {
                    return new Promise(function (resolve, reject) {
                        _this.receiverQueue.push([resolve, reject]);
                    });
                }
            },
        };
    };
    WebSocketClient.prototype.send = function (message) {
        return __awaiter(this, void 0, void 0, function () {
            var serialized;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.connectedPromise];
                    case 1:
                        _a.sent();
                        if (this.error) {
                            throw this.error;
                        }
                        serialized = this.serialize(message);
                        return [2 /*return*/, sendMessage(this.socket, serialized)];
                }
            });
        });
    };
    WebSocketClient.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.connectedPromise];
                    case 1:
                        _a.sent();
                        if (this.done) {
                            return [2 /*return*/];
                        }
                        this.socket.close();
                        return [4 /*yield*/, this.closedPromise];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return WebSocketClient;
}());

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
function isKeyCredential(credential) {
    return (typeof credential === "object" &&
        credential !== null &&
        "key" in credential &&
        typeof credential.key === "string");
}
function isTokenCredential(credential) {
    return (typeof credential === "object" &&
        credential !== null &&
        "getToken" in credential &&
        typeof credential.getToken === "function");
}
var isCredential = function (credential) {
    return isKeyCredential(credential) || isTokenCredential(credential);
};

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var isRTOpenAIOptions = function (options) {
    return (typeof options === "object" &&
        options !== null &&
        "model" in options &&
        typeof options.model === "string");
};
var isRTAzureOpenAIOptions = function (options) {
    return (typeof options === "object" &&
        options !== null &&
        "deployment" in options &&
        typeof options.deployment === "string");
};

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
function generateUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    else if (typeof window !== "undefined" &&
        window.crypto &&
        window.crypto.getRandomValues) {
        var array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        array[6] = (array[6] & 0x0f) | 0x40; // Version 4
        array[8] = (array[8] & 0x3f) | 0x80; // Variant 10
        return __spreadArray([], __read(array), false).map(function (b, i) {
            return (i === 4 || i === 6 || i === 8 || i === 10 ? "-" : "") +
                b.toString(16).padStart(2, "0");
        })
            .join("");
    }
    else {
        throw new Error("Crypto API not available");
    }
}
function openAISettings(credential, options) {
    var uri = new URL("wss://api.openai.com/v1/realtime");
    uri.searchParams.set("model", options.model);
    return {
        uri: uri,
        protocols: [
            "realtime",
            "openai-insecure-api-key.".concat(credential.key),
            "openai-beta.realtime-v1",
        ],
    };
}
function azureOpenAISettings(uri, credential, options) {
    var _this = this;
    var _a;
    var requestId = (_a = options.requestId) !== null && _a !== void 0 ? _a : generateUUID();
    var scopes = ["https://cognitiveservices.azure.com/.default"];
    uri.searchParams.set("api-version", "2024-10-01-preview");
    uri.searchParams.set("x-ms-client-request-id", requestId);
    uri.searchParams.set("deployment", options.deployment);
    uri.pathname = "openai/realtime";
    return {
        uri: uri,
        headers: undefined,
        policy: function (settings) { return __awaiter(_this, void 0, void 0, function () {
            var token;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!isKeyCredential(credential)) return [3 /*break*/, 1];
                        settings.uri.searchParams.set("api-key", credential.key);
                        return [3 /*break*/, 3];
                    case 1: return [4 /*yield*/, credential.getToken(scopes)];
                    case 2:
                        token = _a.sent();
                        settings.uri.searchParams.set("Authorization", "Bearer ".concat(token.token));
                        _a.label = 3;
                    case 3: return [2 /*return*/, settings];
                }
            });
        }); },
        requestId: requestId,
    };
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var MessageQueue = /** @class */ (function () {
    function MessageQueue(receiveDelegate) {
        this.receiveDelegate = receiveDelegate;
        this.messages = [];
        this.waitingReceivers = [];
        this.isPolling = false;
        this.pollPromise = null;
    }
    MessageQueue.prototype.pushBack = function (message) {
        this.messages.push(message);
    };
    MessageQueue.prototype.findAndRemove = function (predicate) {
        var index = this.messages.findIndex(predicate);
        if (index === -1) {
            return null;
        }
        return this.messages.splice(index, 1)[0];
    };
    MessageQueue.prototype.pollReceive = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.isPolling) {
                    return [2 /*return*/];
                }
                this.isPolling = true;
                this.pollPromise = this.doPollReceive();
                return [2 /*return*/, this.pollPromise];
            });
        });
    };
    MessageQueue.prototype.doPollReceive = function () {
        return __awaiter(this, void 0, void 0, function () {
            var message, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, 5, 6]);
                        _a.label = 1;
                    case 1:
                        if (!this.isPolling) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.receiveDelegate()];
                    case 2:
                        message = _a.sent();
                        if (message === null) {
                            this.notifyEndOfStream();
                            return [3 /*break*/, 3];
                        }
                        this.notifyReceiver(message);
                        if (this.waitingReceivers.length === 0) {
                            return [3 /*break*/, 3];
                        }
                        return [3 /*break*/, 1];
                    case 3: return [3 /*break*/, 6];
                    case 4:
                        error_1 = _a.sent();
                        this.notifyError(error_1);
                        return [3 /*break*/, 6];
                    case 5:
                        this.isPolling = false;
                        this.pollPromise = null;
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    MessageQueue.prototype.notifyError = function (error) {
        while (this.waitingReceivers.length > 0) {
            var _a = __read(this.waitingReceivers.shift(), 3); _a[0]; var _b = __read(_a[1], 2); _b[0]; var reject = _b[1]; _a[2];
            reject(error);
        }
    };
    MessageQueue.prototype.notifyEndOfStream = function () {
        while (this.waitingReceivers.length > 0) {
            var _a = __read(this.waitingReceivers.shift(), 3); _a[0]; var _b = __read(_a[1], 2), resolve = _b[0]; _b[1]; _a[2];
            resolve(null);
        }
    };
    MessageQueue.prototype.notifyReceiver = function (message) {
        var index = this.waitingReceivers.findIndex(function (_a) {
            var _b = __read(_a, 3), predicate = _b[0], _c = __read(_b[1], 2); _c[0]; _c[1]; _b[2];
            return predicate(message);
        });
        if (index === -1) {
            this.pushBack(message);
            return;
        }
        var _a = __read(this.waitingReceivers.splice(index, 1)[0], 3); _a[0]; var _b = __read(_a[1], 2), resolve = _b[0]; _b[1]; _a[2];
        resolve(message);
    };
    MessageQueue.prototype.queuedMessageCount = function () {
        return this.messages.length;
    };
    MessageQueue.prototype.receive = function (predicate, abort) {
        var _this = this;
        var foundMessage = this.findAndRemove(predicate);
        if (foundMessage !== null) {
            return Promise.resolve(foundMessage);
        }
        return new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.waitingReceivers.push([
                            predicate,
                            [resolve, reject],
                            abort || new AbortController(),
                        ]);
                        return [4 /*yield*/, this.pollReceive()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    };
    return MessageQueue;
}());
var MessageQueueWithError = /** @class */ (function (_super) {
    __extends(MessageQueueWithError, _super);
    function MessageQueueWithError(receiveDelegate, errorPredicate) {
        var _this = _super.call(this, receiveDelegate) || this;
        _this.errorPredicate = errorPredicate;
        _this.error = undefined;
        return _this;
    }
    MessageQueueWithError.prototype.notifyErrorMessage = function (message) {
        while (this.waitingReceivers.length > 0) {
            var _a = __read(this.waitingReceivers.shift(), 2); _a[0]; var _b = __read(_a[1], 2), resolve = _b[0]; _b[1];
            resolve(message);
        }
    };
    MessageQueueWithError.prototype.notifyReceiver = function (message) {
        if (this.errorPredicate(message)) {
            this.error = message;
            this.notifyErrorMessage(message);
            return;
        }
        var index = this.waitingReceivers.findIndex(function (_a) {
            var _b = __read(_a, 3), predicate = _b[0], _c = __read(_b[1], 2); _c[0]; _c[1]; _b[2];
            return predicate(message);
        });
        if (index === -1) {
            this.pushBack(message);
            return;
        }
        var _a = __read(this.waitingReceivers.splice(index, 1)[0], 3); _a[0]; var _b = __read(_a[1], 2), resolve = _b[0]; _b[1]; _a[2];
        resolve(message);
    };
    MessageQueueWithError.prototype.receive = function (predicate) {
        return __awaiter(this, void 0, void 0, function () {
            var message;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.error !== undefined) {
                            return [2 /*return*/, this.error];
                        }
                        return [4 /*yield*/, _super.prototype.receive.call(this, function (message) { return predicate(message) || _this.errorPredicate(message); })];
                    case 1:
                        message = _a.sent();
                        return [2 /*return*/, message];
                }
            });
        });
    };
    return MessageQueueWithError;
}(MessageQueue));
var SharedEndQueue = /** @class */ (function () {
    function SharedEndQueue(receiveDelegate, errorPredicate, endPredicate) {
        this.receiveDelegate = receiveDelegate;
        this.errorPredicate = errorPredicate;
        this.endPredicate = endPredicate;
        this.queue = [];
        this.lock = Promise.resolve();
    }
    SharedEndQueue.prototype.receive = function (predicate) {
        return __awaiter(this, void 0, void 0, function () {
            var release, i, message, message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.acquireLock()];
                    case 1:
                        release = _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 6, 7]);
                        for (i = 0; i < this.queue.length; i++) {
                            message = this.queue[i];
                            if (predicate(message)) {
                                this.queue.splice(i, 1);
                                return [2 /*return*/, message];
                            }
                            else if (this.endPredicate(message)) {
                                return [2 /*return*/, message];
                            }
                        }
                        _a.label = 3;
                    case 3:
                        return [4 /*yield*/, this.receiveDelegate()];
                    case 4:
                        message = _a.sent();
                        if (message === null ||
                            this.errorPredicate(message) ||
                            predicate(message)) {
                            return [2 /*return*/, message];
                        }
                        if (this.endPredicate(message)) {
                            this.queue.push(message);
                            return [2 /*return*/, message];
                        }
                        this.queue.push(message);
                        return [3 /*break*/, 3];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        release();
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    SharedEndQueue.prototype.acquireLock = function () {
        return __awaiter(this, void 0, void 0, function () {
            var release, newLock, oldLock;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        newLock = new Promise(function (resolve) {
                            release = resolve;
                        });
                        oldLock = this.lock;
                        this.lock = newLock;
                        return [4 /*yield*/, oldLock];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, release];
                }
            });
        });
    };
    return SharedEndQueue;
}());

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
function getRandomValues(array) {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        return crypto.getRandomValues(array);
    }
    else if (typeof window !== "undefined" &&
        window.crypto &&
        window.crypto.getRandomValues) {
        return window.crypto.getRandomValues(array);
    }
    else {
        throw new Error("No secure random number generator available.");
    }
}
function generateId(prefix, length) {
    var array = new Uint8Array(length);
    getRandomValues(array);
    var base64 = btoa(String.fromCharCode.apply(String, __spreadArray([], __read(array), false)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    return "".concat(prefix, "-").concat(base64).slice(0, length);
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var LowLevelRTClient = /** @class */ (function () {
    function LowLevelRTClient(uriOrCredential, credentialOrOptions, options) {
        var settings = (function () {
            if (isKeyCredential(uriOrCredential) &&
                isRTOpenAIOptions(credentialOrOptions)) {
                return openAISettings(uriOrCredential, credentialOrOptions);
            }
            else if (isCredential(credentialOrOptions) &&
                isRTAzureOpenAIOptions(options)) {
                return azureOpenAISettings(uriOrCredential, credentialOrOptions, options);
            }
            else {
                throw new Error("Invalid combination of arguments to initialize the Realtime client");
            }
        })();
        this.requestId = settings.requestId;
        this.client = this.getWebsocket(settings);
    }
    LowLevelRTClient.prototype.getWebsocket = function (settings) {
        var handler = {
            validate: function (event) {
                if (typeof event.data !== "string") {
                    return validationError(new Error("Invalid message type"));
                }
                try {
                    var data = JSON.parse(event.data);
                    if (isServerMessageType(data)) {
                        return validationSuccess(data);
                    }
                    return validationError(new Error("Invalid message type"));
                }
                catch (error) {
                    return validationError(new Error("Invalid JSON message"));
                }
            },
            serialize: function (message) { return JSON.stringify(message); },
        };
        return new WebSocketClient(settings, handler);
    };
    LowLevelRTClient.prototype.messages = function () {
        return __asyncGenerator(this, arguments, function messages_1() {
            var _a, _b, _c, message, e_1_1;
            var _d, e_1, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        _g.trys.push([0, 7, 8, 13]);
                        _a = true, _b = __asyncValues(this.client);
                        _g.label = 1;
                    case 1: return [4 /*yield*/, __await(_b.next())];
                    case 2:
                        if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 6];
                        _f = _c.value;
                        _a = false;
                        message = _f;
                        return [4 /*yield*/, __await(message)];
                    case 3: return [4 /*yield*/, _g.sent()];
                    case 4:
                        _g.sent();
                        _g.label = 5;
                    case 5:
                        _a = true;
                        return [3 /*break*/, 1];
                    case 6: return [3 /*break*/, 13];
                    case 7:
                        e_1_1 = _g.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 13];
                    case 8:
                        _g.trys.push([8, , 11, 12]);
                        if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 10];
                        return [4 /*yield*/, __await(_e.call(_b))];
                    case 9:
                        _g.sent();
                        _g.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 12: return [7 /*endfinally*/];
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    LowLevelRTClient.prototype.send = function (message) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.send(message)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    LowLevelRTClient.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.close()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return LowLevelRTClient;
}());
var RTError = /** @class */ (function (_super) {
    __extends(RTError, _super);
    function RTError(errorDetails) {
        var _this = _super.call(this, errorDetails.message) || this;
        _this.errorDetails = errorDetails;
        Object.setPrototypeOf(_this, RTError.prototype);
        return _this;
    }
    Object.defineProperty(RTError.prototype, "code", {
        get: function () {
            return this.errorDetails.code;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTError.prototype, "param", {
        get: function () {
            return this.errorDetails.param;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTError.prototype, "eventId", {
        get: function () {
            return this.errorDetails.event_id;
        },
        enumerable: false,
        configurable: true
    });
    return RTError;
}(Error));
var RTInputAudioItem = /** @class */ (function () {
    function RTInputAudioItem(id, audioStartMillis, hasTranscription, queue) {
        this.id = id;
        this.audioStartMillis = audioStartMillis;
        this.hasTranscription = hasTranscription;
        this.queue = queue;
        this.type = "input_audio";
        this.audioEndMillis = undefined;
        this.transcription = undefined;
        this.waitPromise = null;
    }
    RTInputAudioItem.create = function (id, audioStartMillis, hasTranscription, queue) {
        return new RTInputAudioItem(id, audioStartMillis, hasTranscription, queue);
    };
    RTInputAudioItem.prototype.wait = function () {
        return __awaiter(this, void 0, void 0, function () {
            var itemIdValidMessage, message;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        itemIdValidMessage = function (message) {
                            return [
                                "input_audio_buffer.speech_stopped",
                                "conversation.item.input_audio_transcription.completed",
                                "conversation.item.input_audio_transcription.failed",
                            ].includes(message.type);
                        };
                        _a.label = 1;
                    case 1:
                        return [4 /*yield*/, this.queue.receive(function (m) {
                                return (itemIdValidMessage(m) && m.item_id == _this.id) ||
                                    (m.type === "conversation.item.created" && m.item.id == _this.id);
                            })];
                    case 2:
                        message = _a.sent();
                        if (message === null) {
                            return [2 /*return*/];
                        }
                        else if (message.type === "error") {
                            throw new RTError(message.error);
                        }
                        else if (message.type === "input_audio_buffer.speech_stopped") {
                            this.audioEndMillis = message.audio_end_ms;
                            if (!this.hasTranscription) {
                                return [2 /*return*/];
                            }
                        }
                        else if (message.type === "conversation.item.created" &&
                            !this.hasTranscription) {
                            return [2 /*return*/];
                        }
                        else if (message.type === "conversation.item.input_audio_transcription.completed") {
                            this.transcription = message.transcript;
                            return [2 /*return*/];
                        }
                        else if (message.type === "conversation.item.input_audio_transcription.failed") {
                            throw new RTError(message.error);
                        }
                        return [3 /*break*/, 1];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    RTInputAudioItem.prototype.waitForCompletion = function () {
        if (!this.waitPromise) {
            this.waitPromise = this.wait();
        }
        return this.waitPromise;
    };
    return RTInputAudioItem;
}());
/* TODO: Move to PAL so we use Buffer.from in Node */
function decodeBase64(base64) {
    var binaryString = atob(base64);
    var length = binaryString.length;
    var uint8Array = new Uint8Array(length);
    for (var i = 0; i < length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
    }
    return uint8Array;
}
var RTAudioContent = /** @class */ (function () {
    function RTAudioContent(message, queue) {
        var _this = this;
        this.queue = queue;
        this.type = "audio";
        this.itemId = message.item_id;
        this.contentIndex = message.content_index;
        if (message.part.type !== "audio") {
            throw new Error("Unexpected part type");
        }
        this.part = message.part;
        this.contentQueue = new SharedEndQueue(function () { return _this.receiveContent(); }, function (m) { return m !== null && m.type === "error"; }, function (m) { return m !== null && m.type === "response.content_part.done"; });
    }
    RTAudioContent.create = function (message, queue) {
        return new RTAudioContent(message, queue);
    };
    Object.defineProperty(RTAudioContent.prototype, "transcript", {
        get: function () {
            return this.part.transcript;
        },
        enumerable: false,
        configurable: true
    });
    RTAudioContent.prototype.receiveContent = function () {
        var _this = this;
        function isValidMessage(m) {
            return [
                "response.audio.delta",
                "response.audio.done",
                "response.audio_transcript.delta",
                "response.audio_transcript.done",
                "response.content_part.done",
            ].includes(m.type);
        }
        return this.queue.receive(function (m) {
            return isValidMessage(m) &&
                m.item_id === _this.itemId &&
                m.content_index === _this.contentIndex;
        });
    };
    RTAudioContent.prototype.audioChunks = function () {
        return __asyncGenerator(this, arguments, function audioChunks_1() {
            var message, buffer;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        return [4 /*yield*/, __await(this.contentQueue.receive(function (m) {
                                return m !== null &&
                                    ["response.audio.delta", "response.audio.done"].includes(m.type);
                            }))];
                    case 1:
                        message = _a.sent();
                        if (!(message === null)) return [3 /*break*/, 2];
                        return [3 /*break*/, 9];
                    case 2:
                        if (!(message.type === "error")) return [3 /*break*/, 3];
                        throw new RTError(message.error);
                    case 3:
                        if (!(message.type === "response.content_part.done")) return [3 /*break*/, 4];
                        if (message.part.type !== "audio") {
                            throw new Error("Unexpected part type");
                        }
                        this.part = message.part;
                        return [3 /*break*/, 9];
                    case 4:
                        if (!(message.type === "response.audio.delta")) return [3 /*break*/, 7];
                        buffer = decodeBase64(message.delta);
                        return [4 /*yield*/, __await(buffer)];
                    case 5: return [4 /*yield*/, _a.sent()];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        if (message.type === "response.audio.done") {
                            // We are skipping this as it's information is already provided by 'response.content_part.done'
                            // and that is a better signal to end the iteration
                            return [3 /*break*/, 0];
                        }
                        _a.label = 8;
                    case 8: return [3 /*break*/, 0];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    RTAudioContent.prototype.transcriptChunks = function () {
        return __asyncGenerator(this, arguments, function transcriptChunks_1() {
            var message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        return [4 /*yield*/, __await(this.contentQueue.receive(function (m) {
                                return m !== null &&
                                    [
                                        "response.audio_transcript.delta",
                                        "response.audio_transcript.done",
                                    ].includes(m.type);
                            }))];
                    case 1:
                        message = _a.sent();
                        if (!(message === null)) return [3 /*break*/, 2];
                        return [3 /*break*/, 9];
                    case 2:
                        if (!(message.type === "error")) return [3 /*break*/, 3];
                        throw new RTError(message.error);
                    case 3:
                        if (!(message.type === "response.content_part.done")) return [3 /*break*/, 4];
                        if (message.part.type !== "audio") {
                            throw new Error("Unexpected part type");
                        }
                        this.part = message.part;
                        return [3 /*break*/, 9];
                    case 4:
                        if (!(message.type === "response.audio_transcript.delta")) return [3 /*break*/, 7];
                        return [4 /*yield*/, __await(message.delta)];
                    case 5: return [4 /*yield*/, _a.sent()];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        if (message.type === "response.audio_transcript.done") {
                            // We are skipping this as it's information is already provided by 'response.content_part.done'
                            // and that is a better signal to end the iteration
                            return [3 /*break*/, 0];
                        }
                        _a.label = 8;
                    case 8: return [3 /*break*/, 0];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    return RTAudioContent;
}());
var RTTextContent = /** @class */ (function () {
    function RTTextContent(message, queue) {
        this.queue = queue;
        this.type = "text";
        this.itemId = message.item_id;
        this.contentIndex = message.content_index;
        if (message.part.type !== "text") {
            throw new Error("Unexpected part type");
        }
        this.part = message.part;
    }
    RTTextContent.create = function (message, queue) {
        return new RTTextContent(message, queue);
    };
    Object.defineProperty(RTTextContent.prototype, "text", {
        get: function () {
            return this.part.text;
        },
        enumerable: false,
        configurable: true
    });
    RTTextContent.prototype.textChunks = function () {
        return __asyncGenerator(this, arguments, function textChunks_1() {
            var message;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        return [4 /*yield*/, __await(this.queue.receive(function (m) {
                                return (m.type === "response.content_part.done" ||
                                    m.type === "response.text.delta" ||
                                    m.type === "response.text.done") &&
                                    m.item_id === _this.itemId &&
                                    m.content_index === _this.contentIndex;
                            }))];
                    case 1:
                        message = _a.sent();
                        if (!(message === null)) return [3 /*break*/, 2];
                        return [3 /*break*/, 9];
                    case 2:
                        if (!(message.type === "error")) return [3 /*break*/, 3];
                        throw new RTError(message.error);
                    case 3:
                        if (!(message.type === "response.content_part.done")) return [3 /*break*/, 4];
                        if (message.part.type !== "text") {
                            throw new Error("Unexpected part type");
                        }
                        this.part = message.part;
                        return [3 /*break*/, 9];
                    case 4:
                        if (!(message.type === "response.text.delta")) return [3 /*break*/, 7];
                        return [4 /*yield*/, __await(message.delta)];
                    case 5: return [4 /*yield*/, _a.sent()];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        if (message.type === "response.text.done") {
                            // We are skipping this as it's information is already provided by 'response.content_part.done'
                            // and that is a better signal to end the iteration
                            return [3 /*break*/, 0];
                        }
                        _a.label = 8;
                    case 8: return [3 /*break*/, 0];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    return RTTextContent;
}());
var RTMessageItem = /** @class */ (function () {
    function RTMessageItem(responseId, item, previousItemId, queue) {
        this.responseId = responseId;
        this.item = item;
        this.previousItemId = previousItemId;
        this.queue = queue;
        this.type = "message";
    }
    RTMessageItem.create = function (responseId, item, previousItemId, queue) {
        return new RTMessageItem(responseId, item, previousItemId, queue);
    };
    Object.defineProperty(RTMessageItem.prototype, "id", {
        get: function () {
            return this.item.id;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTMessageItem.prototype, "role", {
        get: function () {
            return this.item.role;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTMessageItem.prototype, "status", {
        get: function () {
            return this.item.status;
        },
        enumerable: false,
        configurable: true
    });
    RTMessageItem.prototype[Symbol.asyncIterator] = function () {
        return __asyncGenerator(this, arguments, function _a() {
            var message;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        return [4 /*yield*/, __await(this.queue.receive(function (m) {
                                return (m.type === "response.content_part.added" && m.item_id === _this.id) ||
                                    (m.type === "response.output_item.done" && m.item.id === _this.id);
                            }))];
                    case 1:
                        message = _b.sent();
                        if (!(message === null)) return [3 /*break*/, 2];
                        return [3 /*break*/, 14];
                    case 2:
                        if (!(message.type === "error")) return [3 /*break*/, 3];
                        throw new RTError(message.error);
                    case 3:
                        if (!(message.type === "response.output_item.done")) return [3 /*break*/, 4];
                        if (message.item.type === "message") {
                            this.item = message.item;
                        }
                        else {
                            throw new Error("Unexpected item type");
                        }
                        return [3 /*break*/, 14];
                    case 4:
                        if (!(message.type === "response.content_part.added")) return [3 /*break*/, 12];
                        if (!(message.part.type === "audio")) return [3 /*break*/, 7];
                        return [4 /*yield*/, __await(RTAudioContent.create(message, this.queue))];
                    case 5: return [4 /*yield*/, _b.sent()];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 11];
                    case 7:
                        if (!(message.part.type === "text")) return [3 /*break*/, 10];
                        return [4 /*yield*/, __await(RTTextContent.create(message, this.queue))];
                    case 8: return [4 /*yield*/, _b.sent()];
                    case 9:
                        _b.sent();
                        return [3 /*break*/, 11];
                    case 10: throw new Error("Unexpected part type: ".concat(message.part.type));
                    case 11: return [3 /*break*/, 13];
                    case 12: throw new Error("Unexpected message type: ".concat(message.type));
                    case 13: return [3 /*break*/, 0];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    return RTMessageItem;
}());
var RTFunctionCallItem = /** @class */ (function () {
    function RTFunctionCallItem(responseId, item, previousItemId, queue) {
        this.responseId = responseId;
        this.item = item;
        this.previousItemId = previousItemId;
        this.queue = queue;
        this.type = "function_call";
        this.awaited = false;
        this.iterated = false;
    }
    RTFunctionCallItem.create = function (responseId, item, previousItemId, queue) {
        return new RTFunctionCallItem(responseId, item, previousItemId, queue);
    };
    Object.defineProperty(RTFunctionCallItem.prototype, "id", {
        get: function () {
            return this.item.id;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTFunctionCallItem.prototype, "functionName", {
        get: function () {
            return this.item.name;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTFunctionCallItem.prototype, "callId", {
        get: function () {
            return this.item.call_id;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTFunctionCallItem.prototype, "arguments", {
        get: function () {
            return this.item.arguments;
        },
        enumerable: false,
        configurable: true
    });
    RTFunctionCallItem.prototype.inner = function () {
        return __asyncGenerator(this, arguments, function inner_1() {
            var message;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        return [4 /*yield*/, __await(this.queue.receive(function (m) {
                                return ((m.type == "response.function_call_arguments.delta" ||
                                    m.type == "response.function_call_arguments.done") &&
                                    m.item_id === _this.id) ||
                                    (m.type === "response.output_item.done" && m.item.id === _this.id);
                            }))];
                    case 1:
                        message = _a.sent();
                        if (!(message === null)) return [3 /*break*/, 2];
                        return [3 /*break*/, 9];
                    case 2:
                        if (!(message.type === "error")) return [3 /*break*/, 3];
                        throw new RTError(message.error);
                    case 3:
                        if (!(message.type === "response.output_item.done")) return [3 /*break*/, 4];
                        if (message.item.type === "function_call") {
                            this.item = message.item;
                            return [3 /*break*/, 9];
                        }
                        else {
                            throw new Error("Unexpected item type");
                        }
                    case 4:
                        if (!(message.type === "response.function_call_arguments.delta")) return [3 /*break*/, 7];
                        return [4 /*yield*/, __await(message.delta)];
                    case 5: return [4 /*yield*/, _a.sent()];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        if (message.type === "response.function_call_arguments.done") {
                            return [3 /*break*/, 0];
                        }
                        else {
                            throw new Error("Unexpected message type: ".concat(message.type));
                        }
                    case 8: return [3 /*break*/, 0];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    RTFunctionCallItem.prototype[Symbol.asyncIterator] = function () {
        return __asyncGenerator(this, arguments, function _a() {
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.awaited) {
                            throw new Error("Cannot iterate after awaiting.");
                        }
                        this.iterated = true;
                        return [4 /*yield*/, __await(this.inner())];
                    case 1: return [2 /*return*/, _b.sent()];
                }
            });
        });
    };
    RTFunctionCallItem.prototype.waitForCompletion = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, _c, e_2_1;
            var _d, e_2, _e;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        if (this.iterated) {
                            throw new Error("Cannot await after iterating.");
                        }
                        this.awaited = true;
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 6, 7, 12]);
                        _a = true, _b = __asyncValues(this.inner());
                        _g.label = 2;
                    case 2: return [4 /*yield*/, _b.next()];
                    case 3:
                        if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 5];
                        _c.value;
                        _a = false;
                        _g.label = 4;
                    case 4:
                        _a = true;
                        return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 12];
                    case 6:
                        e_2_1 = _g.sent();
                        e_2 = { error: e_2_1 };
                        return [3 /*break*/, 12];
                    case 7:
                        _g.trys.push([7, , 10, 11]);
                        if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 9];
                        return [4 /*yield*/, _e.call(_b)];
                    case 8:
                        _g.sent();
                        _g.label = 9;
                    case 9: return [3 /*break*/, 11];
                    case 10:
                        if (e_2) throw e_2.error;
                        return [7 /*endfinally*/];
                    case 11: return [7 /*endfinally*/];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    return RTFunctionCallItem;
}());
function isMessageItem(item) {
    return item.type === "message";
}
function isFunctionCallItem(item) {
    return item.type === "function_call";
}
var RTResponse = /** @class */ (function () {
    function RTResponse(response, queue, client) {
        this.response = response;
        this.queue = queue;
        this.client = client;
        this.type = "response";
        this.done = false;
    }
    RTResponse.create = function (response, queue, client) {
        return new RTResponse(response, queue, client);
    };
    Object.defineProperty(RTResponse.prototype, "id", {
        get: function () {
            return this.response.id;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTResponse.prototype, "status", {
        get: function () {
            return this.response.status;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTResponse.prototype, "statusDetails", {
        get: function () {
            return this.response.status_details;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTResponse.prototype, "output", {
        get: function () {
            return this.response.output;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(RTResponse.prototype, "usage", {
        get: function () {
            return this.response.usage;
        },
        enumerable: false,
        configurable: true
    });
    RTResponse.prototype.cancel = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, _c, e_3_1;
            var _d, e_3, _e;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0: return [4 /*yield*/, this.client.send({
                            type: "response.cancel",
                        })];
                    case 1:
                        _g.sent();
                        _g.label = 2;
                    case 2:
                        _g.trys.push([2, 7, 8, 13]);
                        _a = true, _b = __asyncValues(this);
                        _g.label = 3;
                    case 3: return [4 /*yield*/, _b.next()];
                    case 4:
                        if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 6];
                        _c.value;
                        _a = false;
                        _g.label = 5;
                    case 5:
                        _a = true;
                        return [3 /*break*/, 3];
                    case 6: return [3 /*break*/, 13];
                    case 7:
                        e_3_1 = _g.sent();
                        e_3 = { error: e_3_1 };
                        return [3 /*break*/, 13];
                    case 8:
                        _g.trys.push([8, , 11, 12]);
                        if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 10];
                        return [4 /*yield*/, _e.call(_b)];
                    case 9:
                        _g.sent();
                        _g.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        if (e_3) throw e_3.error;
                        return [7 /*endfinally*/];
                    case 12: return [7 /*endfinally*/];
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    RTResponse.prototype[Symbol.asyncIterator] = function () {
        var _this = this;
        return {
            next: function () { return __awaiter(_this, void 0, void 0, function () {
                var message, created_message, messageItem, functionCallItem;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (this.done) {
                                return [2 /*return*/, { value: undefined, done: true }];
                            }
                            return [4 /*yield*/, this.queue.receive(function (m) {
                                    return (m.type === "response.done" && m.response.id === _this.id) ||
                                        (m.type === "response.output_item.added" &&
                                            m.response_id === _this.id);
                                })];
                        case 1:
                            message = _a.sent();
                            if (!(message === null)) return [3 /*break*/, 2];
                            return [2 /*return*/, { value: undefined, done: true }];
                        case 2:
                            if (!(message.type === "error")) return [3 /*break*/, 3];
                            throw new RTError(message.error);
                        case 3:
                            if (!(message.type === "response.done")) return [3 /*break*/, 4];
                            this.done = true;
                            this.response = message.response;
                            return [2 /*return*/, { value: undefined, done: true }];
                        case 4:
                            if (!(message.type === "response.output_item.added")) return [3 /*break*/, 6];
                            return [4 /*yield*/, this.queue.receive(function (m) {
                                    return m.type === "conversation.item.created" &&
                                        m.item.id === message.item.id;
                                })];
                        case 5:
                            created_message = _a.sent();
                            if (created_message === null) {
                                return [2 /*return*/, { value: undefined, done: true }];
                            }
                            else if (created_message.type === "error") {
                                throw new RTError(created_message.error);
                            }
                            else if (created_message.type === "conversation.item.created") {
                                if (created_message.item.type === "message") {
                                    messageItem = RTMessageItem.create(this.id, created_message.item, created_message.previous_item_id, this.queue);
                                    return [2 /*return*/, { value: messageItem, done: false }];
                                }
                                else if (created_message.item.type === "function_call") {
                                    functionCallItem = RTFunctionCallItem.create(this.id, created_message.item, created_message.previous_item_id, this.queue);
                                    return [2 /*return*/, { value: functionCallItem, done: false }];
                                }
                                else {
                                    throw new Error("Unexpected item type (".concat(created_message.item.type, "."));
                                }
                            }
                            else {
                                throw new Error("Unexpected message type: ".concat(created_message.type));
                            }
                        case 6: throw new Error("Unexpected message type: ".concat(message.type));
                        case 7: return [2 /*return*/];
                    }
                });
            }); },
        };
    };
    return RTResponse;
}());
var RTClient = /** @class */ (function () {
    function RTClient(uriOrCredential, credentialOrOptions, options) {
        var _this = this;
        this.iterating = false;
        this.client = (function () {
            if (isKeyCredential(uriOrCredential)) {
                return new LowLevelRTClient(uriOrCredential, credentialOrOptions);
            }
            else {
                return new LowLevelRTClient(uriOrCredential, credentialOrOptions, options);
            }
        })();
        this.messagesIterable = this.client.messages()[Symbol.asyncIterator]();
        this.messageQueue = new MessageQueueWithError(function () { return _this.receiveMessages(); }, function (m) { return m.type === "error"; });
    }
    RTClient.prototype.receiveMessages = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.messagesIterable.next()];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.done ? null : result.value];
                }
            });
        });
    };
    Object.defineProperty(RTClient.prototype, "requestId", {
        get: function () {
            return this.client.requestId;
        },
        enumerable: false,
        configurable: true
    });
    RTClient.prototype.init = function () {
        var _this = this;
        if (this.initPromise !== undefined) {
            return this.initPromise;
        }
        this.initPromise = (function () { return __awaiter(_this, void 0, void 0, function () {
            var message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.session !== undefined) {
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, this.messageQueue.receive(function (m) { return m.type === "session.created"; })];
                    case 1:
                        message = _a.sent();
                        if (message === null) {
                            throw new Error("Failed to initialize session");
                        }
                        if (message.type === "error") {
                            throw new RTError(message.error);
                        }
                        if (message.type !== "session.created") {
                            throw new Error("Unexpected message type");
                        }
                        this.session = message.session;
                        return [2 /*return*/];
                }
            });
        }); })();
        return this.initPromise;
    };
    RTClient.prototype.configure = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.client.send({
                                type: "session.update",
                                session: params,
                            })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.messageQueue.receive(function (m) { return m.type === "session.updated"; })];
                    case 3:
                        message = _a.sent();
                        if (message === null) {
                            throw new Error("Failed to update session");
                        }
                        if (message.type === "error") {
                            throw new RTError(message.error);
                        }
                        if (message.type !== "session.updated") {
                            throw new Error("Unexpected message type");
                        }
                        this.session = message.session;
                        return [2 /*return*/, this.session];
                }
            });
        });
    };
    RTClient.prototype.sendAudio = function (audio) {
        return __awaiter(this, void 0, void 0, function () {
            var base64;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        base64 = btoa(String.fromCharCode.apply(String, __spreadArray([], __read(audio), false)));
                        return [4 /*yield*/, this.client.send({
                                type: "input_audio_buffer.append",
                                audio: base64,
                            })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    RTClient.prototype.commitAudio = function () {
        return __awaiter(this, void 0, void 0, function () {
            var message;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _c.sent();
                        return [4 /*yield*/, this.client.send({ type: "input_audio_buffer.commit" })];
                    case 2:
                        _c.sent();
                        return [4 /*yield*/, this.messageQueue.receive(function (m) { return m.type === "input_audio_buffer.committed"; })];
                    case 3:
                        message = _c.sent();
                        if (message === null) {
                            throw new Error("Failed to commit audio");
                        }
                        else if (message.type === "error") {
                            throw new RTError(message.error);
                        }
                        else if (message.type === "input_audio_buffer.committed") {
                            return [2 /*return*/, RTInputAudioItem.create(message.item_id, undefined, ((_a = this.session) === null || _a === void 0 ? void 0 : _a.input_audio_transcription) !== undefined &&
                                    ((_b = this.session) === null || _b === void 0 ? void 0 : _b.input_audio_transcription) !== null, this.messageQueue)];
                        }
                        else {
                            throw new Error("Unexpected message type");
                        }
                }
            });
        });
    };
    RTClient.prototype.clearAudio = function () {
        return __awaiter(this, void 0, void 0, function () {
            var message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.client.send({ type: "input_audio_buffer.clear" })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.messageQueue.receive(function (m) { return m.type === "input_audio_buffer.cleared"; })];
                    case 3:
                        message = _a.sent();
                        if (message === null) {
                            throw new Error("Failed to clear audio");
                        }
                        else if (message.type === "error") {
                            throw new RTError(message.error);
                        }
                        else if (message.type !== "input_audio_buffer.cleared") {
                            throw new Error("Unexpected message type");
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    RTClient.prototype.sendItem = function (item, previousItemId) {
        return __awaiter(this, void 0, void 0, function () {
            var message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        item.id = item.id || generateId("item", 32);
                        return [4 /*yield*/, this.client.send({
                                type: "conversation.item.create",
                                previous_item_id: previousItemId,
                                item: item,
                            })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.messageQueue.receive(function (m) { return m.type === "conversation.item.created" && m.item.id === item.id; })];
                    case 3:
                        message = _a.sent();
                        if (message === null) {
                            throw new Error("Failed to create item");
                        }
                        else if (message.type === "error") {
                            throw new RTError(message.error);
                        }
                        else if (message.type === "conversation.item.created") {
                            return [2 /*return*/, message.item];
                        }
                        else {
                            throw new Error("Unexpected message type");
                        }
                }
            });
        });
    };
    RTClient.prototype.removeItem = function (itemId) {
        return __awaiter(this, void 0, void 0, function () {
            var message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.client.send({
                                type: "conversation.item.delete",
                                item_id: itemId,
                            })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.messageQueue.receive(function (m) { return m.type === "conversation.item.deleted" && m.item_id === itemId; })];
                    case 3:
                        message = _a.sent();
                        if (message === null) {
                            throw new Error("Failed to delete item");
                        }
                        else if (message.type === "error") {
                            throw new RTError(message.error);
                        }
                        else if (message.type === "conversation.item.deleted") {
                            return [2 /*return*/];
                        }
                        else {
                            throw new Error("Unexpected message type");
                        }
                }
            });
        });
    };
    RTClient.prototype.generateResponse = function () {
        return __awaiter(this, void 0, void 0, function () {
            var message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.client.send({ type: "response.create" })];
                    case 2:
                        _a.sent();
                        if (!!this.iterating) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.messageQueue.receive(function (m) { return m.type === "response.created"; })];
                    case 3:
                        message = _a.sent();
                        if (message === null) {
                            throw new Error("Failed to create response");
                        }
                        else if (message.type === "error") {
                            throw new RTError(message.error);
                        }
                        else if (message.type === "response.created") {
                            return [2 /*return*/, RTResponse.create(message.response, this.messageQueue, this.client)];
                        }
                        throw new Error("Unexpected message type");
                    case 4: return [2 /*return*/, undefined];
                }
            });
        });
    };
    RTClient.prototype.events = function () {
        return __asyncGenerator(this, arguments, function events_1() {
            var message;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, , 13, 14]);
                        this.iterating = true;
                        _c.label = 1;
                    case 1:
                        return [4 /*yield*/, __await(this.messageQueue.receive(function (m) {
                                return m.type === "input_audio_buffer.speech_started" ||
                                    m.type === "response.created";
                            }))];
                    case 2:
                        message = _c.sent();
                        if (!(message === null)) return [3 /*break*/, 3];
                        return [3 /*break*/, 12];
                    case 3:
                        if (!(message.type === "error")) return [3 /*break*/, 4];
                        throw new RTError(message.error);
                    case 4:
                        if (!(message.type === "input_audio_buffer.speech_started")) return [3 /*break*/, 7];
                        return [4 /*yield*/, __await(RTInputAudioItem.create(message.item_id, message.audio_start_ms, ((_a = this.session) === null || _a === void 0 ? void 0 : _a.input_audio_transcription) !== undefined &&
                                ((_b = this.session) === null || _b === void 0 ? void 0 : _b.input_audio_transcription) !== null, this.messageQueue))];
                    case 5: return [4 /*yield*/, _c.sent()];
                    case 6:
                        _c.sent();
                        return [3 /*break*/, 11];
                    case 7:
                        if (!(message.type === "response.created")) return [3 /*break*/, 10];
                        return [4 /*yield*/, __await(RTResponse.create(message.response, this.messageQueue, this.client))];
                    case 8: return [4 /*yield*/, _c.sent()];
                    case 9:
                        _c.sent();
                        return [3 /*break*/, 11];
                    case 10: throw new Error("Unexpected message type");
                    case 11: return [3 /*break*/, 1];
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        this.iterating = false;
                        return [7 /*endfinally*/];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    RTClient.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.close()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return RTClient;
}());

export { LowLevelRTClient, MessageItemType, RTClient, RTError, isFunctionCallItem, isMessageItem };
//# sourceMappingURL=index.js.map
