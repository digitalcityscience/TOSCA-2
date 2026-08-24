import { describe, expect, test } from "vitest";
import { BroadcastCollabChannel } from "./collabChannel";

describe("BroadcastCollabChannel", () => {
    test("delivers a published message to another subscriber on the same channel name", async () => {
        const publisher = new BroadcastCollabChannel<{ hello: string }>("collab-channel-test-1");
        const subscriber = new BroadcastCollabChannel<{ hello: string }>("collab-channel-test-1");

        const received: { hello: string }[] = [];
        subscriber.subscribe((message) => received.push(message));

        publisher.publish({ hello: "world" });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(received).toEqual([{ hello: "world" }]);

        publisher.close();
        subscriber.close();
    });

    test("unsubscribe stops delivering further messages", async () => {
        const publisher = new BroadcastCollabChannel<{ n: number }>("collab-channel-test-2");
        const subscriber = new BroadcastCollabChannel<{ n: number }>("collab-channel-test-2");

        const received: number[] = [];
        const unsubscribe = subscriber.subscribe((message) => received.push(message.n));

        publisher.publish({ n: 1 });
        await new Promise((resolve) => setTimeout(resolve, 0));
        unsubscribe();

        publisher.publish({ n: 2 });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(received).toEqual([1]);

        publisher.close();
        subscriber.close();
    });
});
