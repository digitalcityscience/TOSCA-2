export default {
    root: {
        class: [
            // Shape
            "rounded-md",
            "shadow-md",

            // Color
            "bg-slate-50 dark:bg-slate-900",
            "text-slate-800 dark:text-slate-0"
        ]
    },
    body: {
        class: "p-3"
    },
    title: {
        class: "text-lg font-bold mb-1"
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
            "text-slate-600/50 dark:text-slate-0/50"
        ]
    },
    content: {
        class: "py-3" // Vertical padding.
    },
    footer: {
        class: "pt-3" // Top padding.
    }
};
