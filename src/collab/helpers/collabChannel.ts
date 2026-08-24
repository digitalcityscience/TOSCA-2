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

    /**
     * A `message` built from Pinia state (as every `collabSync` snapshot/patch is) still carries
     * Vue's reactive `Proxy` wrappers on its nested arrays/objects even after `collabSync`'s
     * per-slice `clone*` helpers shallow-copy the outer object — spreading `[...aoi.corners]`
     * copies the array but not the still-proxied `[lng, lat]` tuples inside it. The structured
     * clone algorithm `postMessage` uses cannot clone those Proxies and throws synchronously
     * ("could not be cloned"), silently dropping the whole message. Routing through a JSON
     * round-trip strips every Proxy down to plain data first — safe here because the same
     * snapshot already survives an identical round-trip in `writeStoredSnapshot`.
     */
    publish(message: TMessage): void {
        this.channel?.postMessage(JSON.parse(JSON.stringify(message)) as TMessage)
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
