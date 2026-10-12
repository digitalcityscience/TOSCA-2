import { describe, expect, test } from "vitest";
import { computeEffective, emptyClaim, emptyUserState, standaloneClaim, type RidersClaim } from "./ridersState";

const lookup = {
    groupKeysOfMode: (mode: string) => (mode === "u-bahn" ? ["u-bahn|U1", "u-bahn|U3"] : mode === "s-bahn" ? ["s-bahn|S1"] : []),
    resolveGroup: (reference: string) => (reference === "U3" ? "u-bahn|U3" : reference.includes("|") ? reference : undefined),
};
const claim = (patch: Partial<RidersClaim>): RidersClaim => ({ ...emptyClaim(), ...patch });

describe("ridersState", () => {
    test("the effective state is the union of every consumer's claim", () => {
        const effective = computeEffective({
            a: claim({ network: ["u-bahn"], vehicleModes: ["u-bahn"] }),
            b: claim({ network: ["bus"], vehicleGroups: ["S1x"], stops: ["bus"] }),
        }, emptyUserState(), lookup);
        expect(effective.network).toEqual(["u-bahn", "bus"]);
        expect(effective.stops).toEqual(["bus"]);
        expect(effective.vehicleGroups.sort()).toEqual(["u-bahn|U1", "u-bahn|U3"]);
    });

    test("releasing one consumer keeps what another still wants", () => {
        const both = { a: claim({ vehicleGroups: ["U3"] }), b: claim({ vehicleModes: ["u-bahn"] }) };
        const { b, ...onlyB } = both;
        void b;
        expect(computeEffective(onlyB as Record<string, RidersClaim>, emptyUserState(), lookup).vehicleGroups).toEqual(["u-bahn|U3"]);
        const { a, ...afterA } = both;
        void a;
        expect(computeEffective(afterA, emptyUserState(), lookup).vehicleGroups.length).toBe(2);
    });

    test("a user hide wins over claims and a user show adds to them", () => {
        const user = emptyUserState();
        user.hidden.vehicleGroups = ["u-bahn|U3"];
        user.shown.network = ["regional"];
        const effective = computeEffective({ a: claim({ vehicleModes: ["u-bahn"] }) }, user, lookup);
        expect(effective.vehicleGroups).toEqual(["u-bahn|U1"]);
        expect(effective.network).toEqual(["regional"]);
    });

    test("vehicles bring the timeline; the dark basemap and controls come only from a claim that asks", () => {
        expect(computeEffective({ a: claim({ vehicleModes: ["s-bahn"] }) }, emptyUserState(), lookup)).toMatchObject({ timeline: true, darkBasemap: false, controls: false });
        expect(computeEffective({ a: claim({ network: ["bus"] }) }, emptyUserState(), lookup).timeline).toBe(false);
        expect(computeEffective({ a: standaloneClaim() }, emptyUserState(), lookup)).toMatchObject({ darkBasemap: false, controls: true, timeline: true });
    });

    test("unresolvable route references show nothing", () => {
        expect(computeEffective({ a: claim({ vehicleGroups: ["nope"] }) }, emptyUserState(), lookup).vehicleGroups).toEqual([]);
    });
});
