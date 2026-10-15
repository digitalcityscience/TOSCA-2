/**
 * Returns how many leading items fit on one row of `available` width.
 *
 * Items keep their order, so overflow always drops the end of the list. When
 * not every item fits, room is reserved for the "More" control that holds the
 * rest, which may leave zero inline items on a very narrow row.
 */
export function countFittingItems(
    itemWidths: readonly number[],
    available: number,
    gap: number,
    moreWidth: number
): number {
    const total = itemWidths.reduce((sum, width) => sum + width, 0);
    if (total + gap * Math.max(itemWidths.length - 1, 0) <= available) {
        return itemWidths.length;
    }

    let used = moreWidth;
    let count = 0;
    for (const width of itemWidths) {
        const next = used + width + gap;
        if (next > available) {
            break;
        }
        used = next;
        count += 1;
    }
    return count;
}
