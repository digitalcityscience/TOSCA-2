/**
 * Transport-agnostic pub/sub boundary for cross-window Collab sync (plan §11). Control and Table
 * program against {@link CollabChannel} only; {@link BroadcastCollabChannel} is the Milestone-1
 * implementation (`BroadcastChannel`, same-origin/same-browser). Swapping to a WebSocket-backed
 * implementation later is a one-file change — nothing outside this file knows the transport.
 */
export interface CollabChannel<TMessage> {
    /** Sends `message` to every other subscriber on the channel (never echoed back to self). */
    publish(message: TMessage): void
    /** Registers `listener` for incoming messages; returns an unsubscribe function. */
    subscribe(listener: (message: TMessage) => void): () => void
    /** Releases the underlying transport. Safe to call more than once. */
    close(): void
}

/** Channel name shared by every Collab window (plan §11). */
export const COLLAB_CHANNEL_NAME = "tosca-collab"

/** `BroadcastChannel`-backed {@link CollabChannel} — same-browser, same-origin transport for M1. */
export class BroadcastCollabChannel<TMessage> implements CollabChannel<TMessage> {
    private channel: BroadcastChannel | undefined

    constructor(name: string = COLLAB_CHANNEL_NAME) {
        this.channel = new BroadcastChannel(name)
    }

    publish(message: TMessage): void {
        this.channel?.postMessage(message)
    }

    subscribe(listener: (message: TMessage) => void): () => void {
        const channel = this.channel
        if (channel === undefined) {
            return () => {}
        }
        const handler = (event: MessageEvent<TMessage>): void => listener(event.data)
        channel.addEventListener("message", handler)
        return () => channel.removeEventListener("message", handler)
    }

    close(): void {
        this.channel?.close()
        this.channel = undefined
    }
}
