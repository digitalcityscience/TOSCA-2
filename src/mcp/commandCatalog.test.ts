import { describe, expect, it, vi } from "vitest";
import { EXPORT_FORMAT, availableCommands, commandCatalog, exportedCommands, toolName } from "./commandCatalog";
import { mapCommands } from "./commands";

vi.mock("@helpers/catalogLayerLoader", () => ({}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

describe("command catalog", () => {
    it("lists every implemented command, and only those, as available", () => {
        expect(availableCommands().map((command) => command.name).sort()).toEqual(Object.keys(mapCommands).sort());
    });

    it("has unique names and complete entries", () => {
        const names = commandCatalog.map((command) => command.name);
        expect(new Set(names).size).toBe(names.length);
        for (const command of commandCatalog) {
            expect(command.name).toMatch(/^[a-z][A-Za-z]+$/);
            expect(command.title.length).toBeGreaterThan(5);
            expect(command.description.length).toBeGreaterThan(30);
            expect(command.params.type).toBe("object");
            expect(command.timeoutSeconds).toBeGreaterThan(0);
        }
    });

    it("requires only parameters it declares", () => {
        for (const command of commandCatalog) {
            const declared = Object.keys(command.params.properties ?? {});
            for (const name of command.params.required ?? []) expect(declared, `${command.name}.${name}`).toContain(name);
        }
    });

    it("names other commands in descriptions by their tool name, as the assistant sees them", () => {
        const camelNames = commandCatalog.map((command) => command.name);
        const texts = (schema: unknown): string[] => JSON.stringify(schema).match(/"description":"[^"]*"/g) ?? [];
        for (const command of commandCatalog) {
            for (const description of [command.description, ...texts(command.params)]) {
                for (const name of camelNames) {
                    expect(description, `${command.name} mentions ${name}`).not.toMatch(new RegExp(`\\b${name}\\b`));
                }
            }
        }
    });

    it("derives the tool name as snake_case", () => {
        expect(toolName("setLayerOpacity")).toBe("set_layer_opacity");
        expect(toolName("getMapState")).toBe("get_map_state");
        expect(toolName("setView")).toBe("set_view");
    });

    it("exports the available commands with the fields the server reads", () => {
        const exported = exportedCommands();
        expect(exported.format).toBe(EXPORT_FORMAT);
        expect(exported.commands.map((command) => command.name)).toEqual(availableCommands().map((command) => command.name));
        for (const command of exported.commands) {
            expect(Object.keys(command).sort()).toEqual(["description", "effect", "name", "params", "timeoutSeconds", "title"]);
        }
        // Plain JSON: nothing is lost on the way to the file.
        expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);
    });
});
