import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import {
    withVueTs,
    vueTsConfigs,
} from "@vue/eslint-config-typescript";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importX from "eslint-plugin-import-x";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default withVueTs(
    {
        ignores: [
            ".claude/**",
            ".codex/**",
            ".stitch/**",
            "auto-imports.d.ts",
            "components.d.ts",
            "coverage/**",
            "dist/**",
            "docs/**",
            "postcss.config.js",
            "src/presets/**/*.js",
            "tailwind.config.js",
            "vite.config.ts",
        ],
    },
    {
        linterOptions: {
            reportUnusedDisableDirectives: "off",
        },
    },
    js.configs.recommended,
    pluginVue.configs["flat/essential"],
    vueTsConfigs.recommendedTypeChecked,
    {
        files: ["**/*.{ts,vue}"],
        languageOptions: {
            globals: globals.browser,
        },
        plugins: {
            "@stylistic": stylistic,
            "import-x": importX,
        },
        settings: {
            "import-x/resolver-next": [
                createTypeScriptImportResolver({
                    alwaysTryTypes: true,
                    project: "tsconfig.json",
                }),
            ],
        },
        rules: {
            "@stylistic/indent": ["error", 4],
            "@stylistic/quotes": ["error", "double"],
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-redundant-type-constituents": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    args: "none",
                    caughtErrors: "none",
                    ignoreRestSiblings: true,
                    vars: "all",
                },
            ],
            "@typescript-eslint/require-await": "off",
            "import-x/no-duplicates": "error",
            "no-tabs": ["error", { allowIndentationTabs: true }],
            "vue/no-useless-template-attributes": "off",
        },
    },
);
