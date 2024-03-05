export default {
    root: {
        class: [
            // Shape
            "rounded-md",
            "shadow-md",

            // Color
            "bg-surface-0 dark:bg-surface-900",
            "text-surface-700 dark:text-surface-0"
        ]
    },
    body: {
        class: "p-3"
    },
    title: {
        class: "font-bold mb-1"
    },
    subtitle: {
        class: [
            // Font
            "font-thin",
            "italic",
            "text-sm",
            // Spacing
            "mb-2",
            // Color
            "text-surface-600/50 dark:text-surface-0/50"
        ]
    },
    content: {
        class: "py-3" // Vertical padding.
    },
    footer: {
        class: "pt-3" // Top padding.
    }
};
