<template>
    <div ref="el" :class="sidebarPositionClass" :id="props.id" class="sidebar group flex grow-0 justify-between absolute rounded-lg p-1  lg:w-[300px] 2xl:w-[350px] 3xl:w-[400px] duration-1000" :style="props.style ? props.style : ''">
        <div class="header w-full flex group-[.sidebar-left]:flex-row-reverse group-[.sidebar-right]:flex-row group-[.sidebar-bottom]:flex-row-reverse">
            <div class="close-button">
                <button class="button" @click="toggleSidebar">Close</button>
            </div>
            <div class="header-content">
                <slot name="header"></slot>
            </div>
        </div>
        <div class="content-body grow p-1 overflow-y-scroll">
            <slot></slot>
        </div>
        <div class="footer">
            <slot name="footer"></slot>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { isNullOrEmpty } from "../core/helpers/functions";
/*
To use this component properly please use props accordingly:
- If you pick position "left" or "right" use "width" to adjust size. "height" prop will be neglected
- If you pick position "bottom" use "height" to adjust size. "width" prop will be neglected.
Also if you use bottom position with left and/or right position z-index of bottom positioned component
will be higher than left and/or right component(s).
**/
interface Props {
    position: "left" | "right" | "bottom",
    id: string,
    width?: string,
    height?: string,
    style?: string,
    bgColor?: string
}
const props = defineProps<Props>()
const sidebarPositionClass = computed(() => {
    return "sidebar-" + props.position
})
// to check width prop with css patterns (ends with 'px', 'vw' or '%')
const widthRegex = /^(\d+(?:\.\d*)?)px$|^(\d+(?:\.\d*)?)vw$|^(\d+(?:\.\d*)?)%$/
// to check height prop with css patterns (ends with 'px', 'vh' or '%')
const heightRegex = /^(\d+(?:\.\d*)?)px$|^(\d+(?:\.\d*)?)vh$|^(\d+(?:\.\d*)?)%$/
// to check  bgcolor prop with hexadecimal color pattern in ex: #AABBCC
const hexColorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/;
// CALCULATED CSS VARIABLES
const backgroundClr = computed(() => {
    if (!isNullOrEmpty(props.bgColor) && hexColorRegex.test(props.bgColor!)) {
        return props.bgColor!
    } else {
        return "transparent"
    }
})
const width4Vertical = computed(() => {
    if ((props.position === "left" || props.position === "right")) {
        if (!isNullOrEmpty(props.width) && widthRegex.test(props.width!)) {
            if (props.position === "left") {
                return `calc(0px - calc(${props.width} + 100px))`
            } else {
                return `calc(${props.width} + 100px)`
            }
        } else {
            if (props.position === "left") {
                return "calc(0px - calc(50px + 30vw))"
            } else {
                return "calc(50px + 30vw)"
            }
        }
    } else {
        return ""
    }
})
const height4Horizontal = computed(() => {
    if ((props.position === "bottom")) {
        if (!isNullOrEmpty(props.height) && heightRegex.test(props.height!)) {
            return `calc(${props.height} + 100px)`
        } else {
            return "calc(30vh + 50px)"
        }
    } else {
        return ""
    }
})
const el = ref<HTMLElement | null>(null)
onMounted(()=> {
    if (el.value !== null){
        el.value.style.setProperty("--width4Vertical", width4Vertical.value);
        el.value.style.setProperty("--height4Horizontal", height4Horizontal.value);
        el.value.style.setProperty("--backgroundClr", backgroundClr.value)
    }
})
/**
Toggle sidebar visibility.
You can also use this function from outside of the component to handle toggle event. For more information visit the link.
@link https://vuejs.org/api/sfc-script-setup.html#defineexpose
@param {MouseEvent} event
@return {void}
*/
function toggleSidebar(event: MouseEvent): void {
    event.preventDefault()
    const el = document.getElementById(props.id)
    const sidebarClasses = el?.classList
    if (!isNullOrEmpty(sidebarClasses)) {
        if (sidebarClasses!.contains("collapsed")) {
            el!.classList.remove("collapsed")
        } else {
            el!.classList.add("collapsed")
        }
    }
}
defineExpose({
    toggleSidebar
})
</script>

<style scoped>
.sidebar {
    background-color: var(--backgroundClr);
}

.sidebar.sidebar-left {
    top: 10px;
    left: 45px;
    z-index: 11;
    height: 90vh;
    flex-direction: column;
    min-width: 15vw;
    backdrop-filter: invert(100%);
}

.sidebar.sidebar-right {
    top: 10px;
    right: 45px;
    z-index: 11;
    height: 90vh;
    flex-direction: column;
    min-width: 15vw;
    backdrop-filter: invert(100%);
}

.sidebar.sidebar-bottom {
    bottom: calc(10vh - 20px);
    left: 45px;
    right: 45px;
    z-index: 12;
    min-height: 15vh;
    flex-direction: column;
    background-color: rgba(210, 210, 210, 0.807);
}
.sidebar.sidebar-left.collapsed {
    transform: translateX(var(--width4Vertical));
}
.sidebar.sidebar-right.collapsed {
    transform: translateX(var(--width4Vertical));
}
.sidebar.sidebar-bottom.collapsed {
    transform: translateY(var(--height4Horizontal));
}
</style>
