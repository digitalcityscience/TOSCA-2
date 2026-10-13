/**
 * Helpers for MapLibre filter expressions.
 *
 * Adapted from `Agora/AGORA/src/core/helpers/maplibreExpressions.ts` (no PrimeVue code).
 */

export type FilterExpression = unknown[];

/** The operands of an `["all", ...]` expression, or the expression itself as a single operand. */
export function unwrapIfAll(expression: unknown): FilterExpression[] {
    if (!Array.isArray(expression) || expression.length === 0) return [];
    if (expression[0] === "all") return expression.slice(1) as FilterExpression[];
    return typeof expression[0] === "string" ? [expression] : [];
}

/**
 * Flatten nested single-element arrays and drop empty `all`/`any`/`none` blocks.
 *
 * @returns A cleaned expression, or `null` when nothing is left.
 */
export function flattenFilterExpression(expression: unknown): FilterExpression | null {
    if (!Array.isArray(expression) || expression.length === 0) return null;
    const [operator, ...rest] = expression as [string, ...unknown[]];
    if (operator === "all" || operator === "any" || operator === "none") {
        const flattened = rest.flatMap((item): FilterExpression[] => {
            if (Array.isArray(item) && item.length === 1 && Array.isArray(item[0])) {
                const inner = flattenFilterExpression(item[0]);
                return inner === null ? [] : [inner];
            }
            const flatItem = flattenFilterExpression(item);
            return flatItem === null ? [] : [flatItem];
        });
        return flattened.length === 0 ? null : [operator, ...flattened];
    }
    if (operator === "!") {
        const inner = flattenFilterExpression(rest[0]);
        return inner === null ? null : [operator, inner];
    }
    return expression;
}

/** Operands of an expression with every nested `all` spliced into its parent (`any` blocks stay whole). */
function allOperands(expression: unknown): FilterExpression[] {
    return unwrapIfAll(expression).flatMap((operand) => (
        operand[0] === "all" ? allOperands(operand) : [operand]
    ));
}

/**
 * Combine a catalog style's own filter with the user's attribute filter as one flat `all`.
 *
 * - no user filter → the style filter, untouched
 * - no style filter → the user filter
 * - both → `["all", ...styleOperands, ...userOperands]` (no nested `all`)
 */
export function combineStyleAndUserFilter(styleFilter: unknown, userFilter: unknown): FilterExpression | undefined {
    const user = flattenFilterExpression(userFilter);
    const userOperands = user === null ? [] : allOperands(user);
    if (userOperands.length === 0) {
        return Array.isArray(styleFilter) ? styleFilter : undefined;
    }
    const style = flattenFilterExpression(styleFilter);
    const styleOperands = style === null ? [] : allOperands(style);
    return ["all", ...styleOperands, ...userOperands];
}
