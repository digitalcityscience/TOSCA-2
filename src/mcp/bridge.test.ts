import { describe, expect, it, vi } from "vitest";
import { createMapBridge, readBridgeUrl, type BridgeSocket, type BridgeState } from "./bridge";

class FakeSocket implements BridgeSocket {
    readyState = 0;
    sent: Array<Record<string, unknown>> = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;

    send(data: string): void {
        this.sent.push(JSON.parse(data) as Record<string, unknown>);
    }

    close(): void {
        this.readyState = 3;
    }

    /** The server accepted the connection. */
    open(): void {
        this.readyState = 1;
        this.onopen?.();
    }

    /** A message from the server. */
    receive(message: Record<string, unknown>): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    /** The connection dropped. */
    drop(): void {
        this.readyState = 3;
        this.onclose?.();
    }

    last(type: string): Record<string, unknown> | undefined {
        return this.sent.filter((message) => message.type === type).at(-1);
    }
}

function setup(options: { token?: string | (() => string | undefined), run?: (method: string, params: Record<string, unknown>) => Promise<unknown> } = {}) {
    const sockets: FakeSocket[] = [];
    const states: BridgeState[] = [];
    const timers: Array<{ callback: () => void, milliseconds: number, cleared: boolean }> = [];
    const token = options.token ?? "t1";
    const run = vi.fn(options.run ?? (async () => ({ done: true })));
    const bridge = createMapBridge({
        url: "wss://tosca.test/mcp-bridge/ws",
        getAccessToken: async () => typeof token === "function" ? token() : token,
        onState: (state) => states.push(state),
        run,
        createSocket: () => {
            const socket = new FakeSocket();
            sockets.push(socket);
            return socket;
        },
        setTimer: (callback, milliseconds) => {
            const timer = { callback, milliseconds, cleared: false };
            timers.push(timer);
            return timer;
        },
        clearTimer: (timer) => { (timer as { cleared: boolean }).cleared = true; },
        now: () => 1_000_000,
    });
    /** Runs the pending timers of one kind (reconnect delays or the 60 s token check). */
    const fire = async (kind: "reconnect" | "token"): Promise<void> => {
        const due = timers.filter((timer) => !timer.cleared && (kind === "token") === (timer.milliseconds === 60_000));
        due.forEach((timer) => { timer.cleared = true; timer.callback(); });
        await flush();
    };
    return { bridge, sockets, states, timers, run, fire, status: () => states.at(-1)?.status };
}

async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

async function connected(context: ReturnType<typeof setup>, paired = false): Promise<FakeSocket> {
    context.bridge.connect();
    await flush();
    const socket = context.sockets.at(-1)!;
    socket.open();
    socket.receive({ type: "tosca:ready", sessionId: "s1", secret: "x", paired: false, code: "K7QM-3XTP", codeExpiresIn: 300 });
    if (paired) socket.receive({ type: "tosca:paired", client: "claude" });
    return socket;
}

describe("map bridge", () => {
    it("sends the access token first and shows the pairing code", async () => {
        const context = setup();
        const socket = await connected(context);

        expect(socket.sent[0]).toEqual({ type: "tosca:hello", token: "t1" });
        expect(context.states.at(-1)).toMatchObject({ status: "waiting", code: "K7QM-3XTP", codeExpiresAt: 1_300_000 });
    });

    it("does not connect without a signed-in user", async () => {
        const context = setup({ token: () => undefined });
        context.bridge.connect();
        await flush();

        expect(context.sockets).toHaveLength(0);
        expect(context.states.at(-1)).toMatchObject({ status: "error", error: "unauthorized" });
    });

    it("runs a command and answers with the same request id", async () => {
        const context = setup({ run: async () => ({ opacity: 0.5 }) });
        const socket = await connected(context, true);

        socket.receive({ type: "tosca:command", requestId: "r1", method: "setLayerOpacity", params: { layerId: "a", opacity: 0.5 } });
        await flush();

        expect(context.run).toHaveBeenCalledWith("setLayerOpacity", { layerId: "a", opacity: 0.5 });
        expect(socket.last("tosca:result")).toEqual({ type: "tosca:result", requestId: "r1", ok: true, value: { opacity: 0.5 } });
        expect(context.states.at(-1)?.commandCount).toBe(1);
    });

    it("runs a repeated request id once and repeats the answer", async () => {
        const context = setup();
        const socket = await connected(context, true);
        const command = { type: "tosca:command", requestId: "r1", method: "addCatalogLayer", params: {} };

        socket.receive(command);
        socket.receive(command);
        await flush();

        expect(context.run).toHaveBeenCalledTimes(1);
        expect(socket.sent.filter((message) => message.type === "tosca:result")).toHaveLength(2);
    });

    it("answers with the error text when a command fails", async () => {
        const context = setup({ run: async () => { throw new Error("Layer not found: x"); } });
        const socket = await connected(context, true);

        socket.receive({ type: "tosca:command", requestId: "r2", method: "removeLayer", params: { layerId: "x" } });
        await flush();

        expect(socket.last("tosca:result")).toEqual({ type: "tosca:result", requestId: "r2", ok: false, error: "Layer not found: x" });
    });

    it("refuses commands before the user's code was claimed", async () => {
        const context = setup();
        const socket = await connected(context, false);

        socket.receive({ type: "tosca:command", requestId: "r3", method: "getMapState", params: {} });
        await flush();

        expect(context.run).not.toHaveBeenCalled();
        expect(socket.last("tosca:result")).toMatchObject({ requestId: "r3", ok: false });
    });

    it("does not send an answer that is too large", async () => {
        const context = setup({ run: async () => "x".repeat(2_000_001) });
        const socket = await connected(context, true);

        socket.receive({ type: "tosca:command", requestId: "r4", method: "getMapState", params: {} });
        await flush();

        expect(socket.last("tosca:result")).toMatchObject({ requestId: "r4", ok: false });
    });

    it("reconnects after a drop and asks to resume the session", async () => {
        const context = setup();
        const first = await connected(context, true);

        first.drop();
        expect(context.status()).toBe("reconnecting");
        await context.fire("reconnect");
        const second = context.sockets[1];
        second.open();
        second.receive({ type: "tosca:ready", sessionId: "s1", secret: "x", paired: true });

        expect(second.sent[0]).toEqual({ type: "tosca:hello", token: "t1", resume: { sessionId: "s1", secret: "x" } });
        expect(context.status()).toBe("paired");
    });

    it("gives up after repeated failures", async () => {
        const context = setup();
        const first = await connected(context);
        first.drop();
        for (let attempt = 0; attempt < 8; attempt += 1) {
            await context.fire("reconnect");
            context.sockets.at(-1)!.drop();
        }

        expect(context.states.at(-1)).toMatchObject({ status: "error", error: "unavailable" });
        expect(context.sockets).toHaveLength(9);
    });

    it("stops for good when the server refuses the user", async () => {
        const context = setup();
        context.bridge.connect();
        await flush();
        const socket = context.sockets[0];
        socket.open();
        socket.receive({ type: "tosca:error", code: "forbidden", message: "no role" });
        socket.drop();
        await context.fire("reconnect");

        expect(context.states.at(-1)).toMatchObject({ status: "error", error: "forbidden" });
        expect(context.sockets).toHaveLength(1);
    });

    it("sends a refreshed token and disconnects when the user is signed out", async () => {
        let token: string | undefined = "t1";
        const context = setup({ token: () => token });
        const socket = await connected(context, true);

        token = "t2";
        await context.fire("token");
        expect(socket.last("tosca:auth")).toEqual({ type: "tosca:auth", token: "t2" });

        token = undefined;
        await context.fire("token");
        expect(context.status()).toBe("off");
        expect(socket.last("tosca:bye")).toBeDefined();
    });

    it("disconnect ends the session and stops reconnecting", async () => {
        const context = setup();
        const socket = await connected(context, true);

        context.bridge.disconnect();
        socket.drop();
        await context.fire("reconnect");

        expect(socket.last("tosca:bye")).toBeDefined();
        expect(context.status()).toBe("off");
        expect(context.sockets).toHaveLength(1);
    });

    it("goes back to a new code when the pairing ends", async () => {
        const context = setup();
        const socket = await connected(context, true);

        socket.receive({ type: "tosca:unpaired", reason: "assistant", code: "ABCD-EFGH", codeExpiresIn: 300 });

        expect(context.states.at(-1)).toMatchObject({ status: "waiting", code: "ABCD-EFGH" });
    });
});

describe("readBridgeUrl", () => {
    it("accepts ws(s) and http(s) addresses and nothing else", () => {
        expect(readBridgeUrl("wss://api.test/mcp-bridge/ws")).toBe("wss://api.test/mcp-bridge/ws");
        expect(readBridgeUrl("https://api.test/mcp-bridge/ws")).toBe("wss://api.test/mcp-bridge/ws");
        expect(readBridgeUrl("http://localhost:8001/mcp-bridge/ws")).toBe("ws://localhost:8001/mcp-bridge/ws");
        expect(readBridgeUrl("")).toBeUndefined();
        expect(readBridgeUrl(undefined)).toBeUndefined();
        expect(readBridgeUrl("javascript:alert(1)")).toBeUndefined();
    });
});
