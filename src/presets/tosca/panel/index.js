export default {
    header: ({ props,state }) => ({
        class: [
            // Flex
            "flex items-center justify-between",

            // Colors
            "text-surface-700 dark:text-surface-0/80",
            "bg-zinc-50 dark:bg-zinc-900",
            "border border-surface-200 dark:border-surface-700",

            // Shape
            { "rounded-tl-lg rounded-tr-lg": !state.d_collapsed,  "rounded-bl-lg rounded-br-lg rounded-tr-lg rounded-tl-lg": state.d_collapsed},
            "transition-all delay-[600ms] duration-100 ease-in-out",
            // Conditional Spacing
            { "p-5": !props.toggleable, "py-3 px-5": props.toggleable }
        ]
    }),
    title: {
        class: "leading-none font-bold"
    },
    toggler: {
        class: [
            // Alignments
            "inline-flex items-center justify-center",
            "relative",

            // Sized
            "w-8 h-8",
            "m-0 p-0",

            // Shape
            "border-0 rounded-full",

            // Background Color
            "bg-zinc-50 dark:bg-zinc-900",
            // Text Color
            "text-zinc-900 dark:text-zinc-50",
            // States
            "hover:text-surface-800 dark:hover:text-surface-0/80",
            "hover:bg-surface-100 dark:hover:bg-surface-800/80",
            "focus:outline-none focus:outline-offset-0 focus-visible:ring focus-visible:ring-primary-400/50 focus-visible:ring-inset dark:focus-visible:ring-primary-300/50",

            // Transitions
            "transition-all duration-300 ease-in-out",

            // Misc
            "overflow-hidden no-underline",
            "cursor-pointer"
        ]
    },
    togglerIcon: {
        class: "inline-block"
    },
    content: {
        class: [
            // Spacing
            "py-3",
            "px-5",

            // Shape
            "border border-t-0 last:rounded-br-lg last:rounded-bl-lg",

            // Color
            "border-surface-200 dark:border-surface-700",
            "bg-surface-0 dark:bg-surface-900",
            "text-surface-700 dark:text-surface-0/80"
        ]
    },
    footer: {
        class: [
            // Spacing
            "py-3 p-5",

            // Shape
            "border border-t-0 rounded-br-lg rounded-bl-lg",

            // Color
            "border-surface-200 dark:border-surface-700",
            "bg-surface-0 dark:bg-surface-900",
            "text-surface-700 dark:text-surface-0/80"
        ]
    },
    transition: {
        enterFromClass: "max-h-0",
        enterActiveClass: "overflow-hidden transition-[max-height] duration-[600ms] ease-in-out",
        enterToClass: "max-h-[1000px]",
        leaveFromClass: "max-h-[1000px]",
        leaveActiveClass: "overflow-hidden transition-[max-height] duration-[600ms] ease-in-out",
        leaveToClass: "max-h-0"
    }
};
