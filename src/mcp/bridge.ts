/**
 * Connection between this browser tab and the TOSCA MCP server, so an AI
 * assistant the user connected can run map commands here.
 *
 * - The tab opens the socket only when the user asks for it and is signed in.
 * - The access token goes in the first message (browsers cannot set headers on
 *   a WebSocket); a refreshed token is sent again while connected.
 * - The server answers with a one-time pairing code the user tells the assistant.
 * - Each command has a `requestId`. A command is run once: if the same id
 *   arrives again, the stored answer is sent back and nothing runs twice.
 * - A lost connection is reopened with growing pauses; the server keeps the
 *   pairing for a short time.
 */
import { getConfig } from "../core/config";
import { commandErrorMessage, dispatch, type CommandParams } from "./commands";

export type BridgeStatus = "off" | "connecting" | "waiting" | "paired" | "reconnecting" | "error";

export interface BridgeState {
    status: BridgeStatus;
    /** Pairing code to tell the assistant, e.g. `K7QM-3XTP`. */
    code?: string;
    /** When the code stops working (epoch milliseconds). */
    codeExpiresAt?: number;
    /** Why the connection ended, for `status: "error"`. */
    error?: "unauthorized" | "forbidden" | "too_many_sessions" | "unavailable";
    /** How many assistant commands ran in this tab. */
    commandCount: number;
}

/** The part of WebSocket the bridge uses (mockable in tests). */
export interface BridgeSocket {
    readyState: number;
    send(data: string): void;
    close(code?: number): void;
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose: (() => void) | null;
}

export interface BridgeOptions {
    url: string;
    getAccessToken: () => Promise<string | undefined>;
    onState: (state: BridgeState) => void;
    run?: (method: string, params: CommandParams) => Promise<unknown>;
    createSocket?: (url: string) => BridgeSocket;
    setTimer?: (callback: () => void, milliseconds: number) => unknown;
    clearTimer?: (timer: unknown) => void;
    now?: () => number;
}

const OPEN = 1;
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];
const MAX_RECONNECT_ATTEMPTS = 8;
const TOKEN_CHECK_MS = 60_000;
const MAX_RESULT_CHARACTERS = 2_000_000;
const REMEMBERED_ANSWERS = 200;
/** Server errors after which reconnecting cannot help. */
const FINAL_ERRORS = new Set(["unauthorized", "forbidden", "too_many_sessions"]);

type Answer = { type: "tosca:result", requestId: string, ok: boolean, value?: unknown, error?: string };

export function createMapBridge(options: BridgeOptions) {
    const run = options.run ?? ((method: string, params: CommandParams) => dispatch(method, params, "mcp"));
    const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as BridgeSocket);
    const setTimer = options.setTimer ?? ((callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds));
    const clearTimer = options.clearTimer ?? ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    const now = options.now ?? (() => Date.now());

    let state: BridgeState = { status: "off", commandCount: 0 };
    let socket: BridgeSocket | undefined;
    let wanted = false;
    let resume: { sessionId: string, secret: string } | undefined;
    let sentToken: string | undefined;
    let attempts = 0;
    let reconnectTimer: unknown;
    let tokenTimer: unknown;
    const answers = new Map<string, Promise<Answer>>();

    function setState(patch: Partial<BridgeState>): void {
        state = { ...state, ...patch };
        options.onState(state);
    }

    function send(message: Record<string, unknown>): void {
        if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
    }

    function codeFields(message: Record<string, unknown>): Partial<BridgeState> {
        const code = typeof message.code === "string" ? message.code : undefined;
        const seconds = typeof message.codeExpiresIn === "number" ? message.codeExpiresIn : 0;
        return { code, codeExpiresAt: code === undefined ? undefined : now() + seconds * 1000 };
    }

    async function answerFor(requestId: string, method: string, params: CommandParams): Promise<Answer> {
        try {
            const value = await run(method, params);
            if ((JSON.stringify(value)?.length ?? 0) > MAX_RESULT_CHARACTERS) {
                return { type: "tosca:result", requestId, ok: false, error: "The answer is too large to send." };
            }
            return { type: "tosca:result", requestId, ok: true, value: value ?? null };
        } catch (error) {
            return { type: "tosca:result", requestId, ok: false, error: commandErrorMessage(error) };
        }
    }

    function handleCommand(message: Record<string, unknown>): void {
        const requestId = typeof message.requestId === "string" ? message.requestId : "";
        const method = typeof message.method === "string" ? message.method : "";
        if (requestId === "") return;
        // Commands are only accepted while the user sees this tab as connected.
        if (state.status !== "paired") {
            send({ type: "tosca:result", requestId, ok: false, error: "This TOSCA tab is not connected to an assistant." });
            return;
        }
        let answer = answers.get(requestId);
        if (answer === undefined) {
            const params = typeof message.params === "object" && message.params !== null ? message.params as CommandParams : {};
            answer = answerFor(requestId, method, params);
            answers.set(requestId, answer);
            if (answers.size > REMEMBERED_ANSWERS) answers.delete(answers.keys().next().value as string);
            setState({ commandCount: state.commandCount + 1 });
        }
        void answer.then(send);
    }

    function handleMessage(raw: unknown): void {
        let message: Record<string, unknown>;
        try {
            const parsed: unknown = JSON.parse(String(raw));
            if (typeof parsed !== "object" || parsed === null) return;
            message = parsed as Record<string, unknown>;
        } catch {
            return;
        }
        switch (message.type) {
            case "tosca:ready":
                attempts = 0;
                resume = { sessionId: String(message.sessionId), secret: String(message.secret) };
                setState({ status: message.paired === true ? "paired" : "waiting", error: undefined, ...codeFields(message) });
                break;
            case "tosca:code":
                setState({ status: "waiting", ...codeFields(message) });
                break;
            case "tosca:paired":
                setState({ status: "paired", code: undefined, codeExpiresAt: undefined });
                break;
            case "tosca:unpaired":
                answers.clear();
                setState({ status: "waiting", ...codeFields(message) });
                break;
            case "tosca:command":
                handleCommand(message);
                break;
            case "tosca:error": {
                const code = String(message.code);
                if (FINAL_ERRORS.has(code)) {
                    wanted = false;
                    setState({ status: "error", error: code as BridgeState["error"], code: undefined, codeExpiresAt: undefined });
                }
                break;
            }
            default:
                break;
        }
    }

    function stopTimers(): void {
        if (reconnectTimer !== undefined) clearTimer(reconnectTimer);
        if (tokenTimer !== undefined) clearTimer(tokenTimer);
        reconnectTimer = undefined;
        tokenTimer = undefined;
    }

    function scheduleTokenCheck(): void {
        tokenTimer = setTimer(() => {
            void options.getAccessToken().then((token) => {
                if (!wanted) return;
                if (token === undefined) {
                    disconnect();
                    return;
                }
                if (token !== sentToken) {
                    sentToken = token;
                    send({ type: "tosca:auth", token });
                }
                scheduleTokenCheck();
            });
        }, TOKEN_CHECK_MS);
    }

    async function open(): Promise<void> {
        const token = await options.getAccessToken();
        if (!wanted) return;
        if (token === undefined) {
            wanted = false;
            setState({ status: "error", error: "unauthorized" });
            return;
        }
        const current = createSocket(options.url);
        socket = current;
        current.onopen = () => {
            sentToken = token;
            current.send(JSON.stringify({ type: "tosca:hello", token, resume }));
            scheduleTokenCheck();
        };
        current.onmessage = (event) => {
            if (socket === current) handleMessage(event.data);
        };
        current.onclose = () => {
            if (socket !== current) return;
            socket = undefined;
            stopTimers();
            if (!wanted) return;
            if (attempts >= MAX_RECONNECT_ATTEMPTS) {
                wanted = false;
                resume = undefined;
                setState({ status: "error", error: "unavailable", code: undefined, codeExpiresAt: undefined });
                return;
            }
            const delay = RECONNECT_DELAYS_MS[Math.min(attempts, RECONNECT_DELAYS_MS.length - 1)];
            attempts += 1;
            setState({ status: "reconnecting", code: undefined, codeExpiresAt: undefined });
            reconnectTimer = setTimer(() => {
                reconnectTimer = undefined;
                void open();
            }, delay);
        };
    }

    /** Opens the connection and asks for a pairing code. */
    function connect(): void {
        if (wanted) return;
        wanted = true;
        attempts = 0;
        resume = undefined;
        answers.clear();
        setState({ status: "connecting", error: undefined, code: undefined, codeExpiresAt: undefined, commandCount: 0 });
        void open();
    }

    /** Ends the assistant connection for this tab. */
    function disconnect(): void {
        wanted = false;
        stopTimers();
        const current = socket;
        socket = undefined;
        if (current !== undefined) {
            if (current.readyState === OPEN) current.send(JSON.stringify({ type: "tosca:bye" }));
            current.close(1000);
        }
        resume = undefined;
        sentToken = undefined;
        answers.clear();
        setState({ status: "off", error: undefined, code: undefined, codeExpiresAt: undefined });
    }

    /** Keeps the socket but ends the pairing; the server sends a new code. */
    function unpair(): void {
        send({ type: "tosca:unpair" });
    }

    function requestNewCode(): void {
        send({ type: "tosca:new-code" });
    }

    return { connect, disconnect, unpair, requestNewCode, getState: () => state };
}

export type MapBridge = ReturnType<typeof createMapBridge>;

/**
 * WebSocket URL of the bridge from `VITE_MCP_BRIDGE_URL` (`wss://…/mcp-bridge/ws`;
 * an `https://` address is accepted too), read through `getConfig` so a container
 * can set it at start. Undefined turns the feature off.
 */
export function readBridgeUrl(value: unknown = getConfig("VITE_MCP_BRIDGE_URL")): string | undefined {
    const raw = typeof value === "string" ? value.trim() : "";
    if (raw === "") return undefined;
    try {
        const url = new URL(raw.replace(/^http/i, "ws"));
        return url.protocol === "ws:" || url.protocol === "wss:" ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}
