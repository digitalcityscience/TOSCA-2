<template>
    <div :class="sidebarPosition" :id="props.id" class="sidebar">
        <div class="header">
            <div class="slider-button">
                <button class="p-button-secondary" @click="toggleSidebar">Slide</button>
            </div>
            <div class="header-content">
                <slot name="header"></slot>
            </div>
        </div>
        <div class="body-content overflow-y-auto">
            <slot></slot>
        </div>
        <div class="footer-content">
            <slot name="footer"></slot>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
    //BEGIN PROPS AND RELATED FUNCTIONS
    export interface Props {
        position: "left" | "right",
        id:string
        width:string
        smWidth?:string
        bgColor?:string
    }
    const props = defineProps<Props>()
    const sidebarPosition = computed(()=>{
        return "sidebar-"+props.position
    })
    const widthRegex = /^(\d+(?:\.\d*)?)px$|^(\d+(?:\.\d*)?)vw$|^(\d+(?:\.\d*)?)%$/
    const lgWidth = computed(()=>{
        if(widthRegex.test(props.width)){
            return props.width
        }else {
            return '20vw'
        }
    })
    const smWidth = computed(()=>{
        if(props.smWidth && widthRegex.test(props.smWidth)){
            return props.width
        }else {
            return '30vw'
        }
    })
    const hexColorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/;
    const backgroundColor = computed(()=>{
        if(props.bgColor && hexColorRegex.test(props.bgColor)){
            return props.bgColor
        } else {
            return 'transparent'
        }
    })
    //END PROPS AND RELATED FUNCTIONS

    function toggleSidebar(event:MouseEvent){
        event.preventDefault()
        const el = document.getElementById(props.id)
        const sidebarClasses = el?.classList
        if(sidebarClasses){
            if(sidebarClasses.contains('collapsed')){
                el.classList.remove('collapsed')
            } else {
                el.classList.add('collapsed')
            }
        }
    }
</script>

<style scoped>
.sidebar{
    position: absolute;
    top: 10px;
    height: 95vh;
    width: v-bind('lgWidth');
    background-color: v-bind('backgroundColor');
    flex-grow: 0;
    z-index: 11;
    padding: 5px;
    border-radius: 8px;
    transition: 1s;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    backdrop-filter: invert(100%)
}
.sidebar > .body-content{
    flex-grow: 1;
    padding: 0.5rem;
}
.sidebar-left.collapsed{
    transform: translateX(-22vw);
}
.sidebar-right.collapsed{
    transform: translateX(22vw);
}
.sidebar > .header {
    width: 100%;
    display: flex;
}
.sidebar.sidebar-left > .header {
    flex-direction: row-reverse;
}
.sidebar.sidebar-right > .header {
    flex-direction: row;
}
.sidebar.sidebar-left.collapsed > .header {
    transform: translateX(5vw);
}
.sidebar.sidebar-right.collapsed > .header {
    transform: translateX(-5vw);
}
@media screen and (max-width: 1499px) {
    .sidebar {
        width: v-bind(smWidth);
    }
    .sidebar.sidebar-left.collapsed {
        transform: translateX(-32vw);
    }
    .sidebar.sidebar-right.collapsed {
        transform: translateX(32vw);
    }
}
.sidebar-left{
    left: 45px;
}
.sidebar-right{
    right: 45px;
}
</style>