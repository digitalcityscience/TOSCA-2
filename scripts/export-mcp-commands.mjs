#!/usr/bin/env node
/**
 * Writes the available map commands of src/mcp/commandCatalog.ts as JSON, for
 * the MCP server (TOSCA-Backend tosca_api/apps/mcp_server/map_commands.json).
 *
 *   npm run mcp:export -- ../TOSCA-Backend/tosca_api/apps/mcp_server/map_commands.json
 *
 * Without a path the JSON goes to stdout. Needs Node >= 22.18 (it loads the
 * TypeScript file directly; commandCatalog.ts has no imports for that reason).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportedCommands } from "../src/mcp/commandCatalog.ts";

const target = process.argv[2];
const text = `${JSON.stringify(exportedCommands(), null, 2)}\n`;

if (target === undefined) {
    process.stdout.write(text);
} else {
    // npm runs scripts in the package folder; INIT_CWD is where the user typed the command.
    const path = resolve(process.env.INIT_CWD ?? process.cwd(), target);
    writeFileSync(path, text);
    console.log(`Wrote ${exportedCommands().commands.length} commands to ${path}`);
}
