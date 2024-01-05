module.exports = {
    "env": {
        "browser": true,
        "es2021": true
    },
    "extends": [
        "standard-with-typescript",
        "plugin:vue/vue3-essential",
        "@vue/eslint-config-typescript",
    ],
    "overrides": [
        {
            "env": {
                "node": true
            },
            "files": [
                ".eslintrc.{js,cjs}"
            ],
            "parserOptions": {
                "sourceType": "script"
            }
        }
    ],
    "parser":"vue-eslint-parser",
    "parserOptions": {
        "parser": "@typescript-eslint/parser",
        "extraFileExtensions": [".vue"],
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "plugins": [
        "vue",
        "@typescript-eslint"
    ],
    "rules": {
        "@typescript-eslint/quotes": ["error", "double"],
        "@typescript-eslint/semi": "off",
        "@typescript-eslint/comma-dangle": "off",
        "@typescript-eslint/member-delimiter-style":"off",
        "@typescript-eslint/space-before-function-paren":"off",
        "arrow-spacing":"off",
        "@typescript-eslint/space-infix-ops":"off",
        "@typescript-eslint/indent":["error", 4],
        "@typescript-eslint/space-before-blocks":"off",
        "@typescript-eslint/key-spacing":"off",
        "@typescript-eslint/no-non-null-assertion":"off",
        "vue/no-useless-template-attributes":"off"
    }
}
