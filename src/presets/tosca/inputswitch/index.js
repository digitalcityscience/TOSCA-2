export default {
    root: ({ props }) => ({
        class: [
            'inline-block relative',
            'w-12 h-7',
            'rounded-2xl',
            {
                'opacity-60 select-none pointer-events-none cursor-default': props.disabled
            }
        ]
    }),
    slider: ({ props }) => ({
        class: [
            // Position
            'absolute top-0 left-0 right-0 bottom-0',
            { 'before:transform before:translate-x-5': props.modelValue == props.trueValue },

            // Shape
            'rounded-2xl',

            // Before:
            'before:absolute before:top-1/2 before:left-1',
            'before:-mt-2.5',
            'before:h-5 before:w-5',
            'before:rounded-full',
            'before:duration-200',
            'before:bg-white',

            // Colors
            'border',
            {
                'bg-gray-300': !(props.modelValue == props.trueValue),
                'bg-gray-600': props.modelValue == props.trueValue
            },

            { 'border-transparent': !props.invalid },

            // Invalid State
            { 'border-red-500': props.invalid },

            // States
            { 'peer-hover:bg-gray-400': !(props.modelValue == props.trueValue) && !props.disabled },
            { 'peer-hover:bg-gray-700': props.modelValue == props.trueValue && !props.disabled },
            'peer-focus-visible:ring peer-focus-visible:ring-gray-400/50',

            // Transition
            'transition-colors duration-200',

            // Misc
            'cursor-pointer'
        ]
    }),
    input: {
        class: [
            'peer',

            // Size
            'w-full',
            'h-full',

            // Position
            'absolute',
            'top-0 left-0',
            'z-10',

            // Spacing
            'p-0',
            'm-0',

            // Shape
            'opacity-0',
            'rounded-[2.5rem]',
            'outline-none',

            // Misc
            'appearance-none',
            'cursor-pointer'
        ]
    }
};
