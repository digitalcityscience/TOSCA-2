export default {
    root: ({ props }) => ({
        class: [
            //Font
            'text-xs font-bold',

            //Alignments
            'inline-flex items-center justify-center',

            //Spacing
            'px-2 py-1',

            //Shape
            {
                'rounded-md': !props.rounded,
                'rounded-full': props.rounded
            },

            //Colors
            'text-primary-inverse',
            {
                'bg-primary-500 dark:bg-primary-400 text-white': !props.severity || props.severity === 'primary',
                'bg-green-500 dark:bg-green-400 text-white': props.severity === 'success',
                'bg-blue-500 dark:bg-blue-400 text-white': props.severity === 'info',
                'bg-orange-500 dark:bg-orange-400 text-black': props.severity === 'warning',
                'bg-red-500 dark:bg-red-400 text-white': props.severity === 'danger',
                'bg-gray-500 dark:bg-gray-400 text-white': props.severity === 'secondary',
              }
        ]
    }),
    value: {
        class: 'leading-normal'
    },
    icon: {
        class: 'mr-1 text-sm'
    }
};
