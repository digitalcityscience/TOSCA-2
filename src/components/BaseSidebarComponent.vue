<template>
    <div :class="sidebarPositionClass" :id="props.id" class="sidebar" :style="props.style ? props.style : ''">
        <div class="header">
            <div class="close-button">
                <button class="button" @click="toggleSidebar">Close</button>
            </div>
            <div class="header-content">
                <slot name="header"></slot>
            </div>
        </div>
        <div class="content-body">
            <slot></slot>
        </div>
        <div class="footer">
            <slot name="footer"></slot>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
    /*
    To use this component properly please use props accordingly:
    - If you pick position "left" or "right" use "width" to adjust size. "height" prop will be neglected
    - If you pick position "bottom" use "height" to adjust size. "width" prop will be neglected.
    Also if you use bottom position with left and/or right position z-index of bottom positioned component
    will be higher than left and/or right component(s).
    **/
    interface Props {
        position: "left" | "right" | "bottom",
        id:string,
        width?:string,
        height?:string,
        style?:string,
        bgColor?:string
    }
    const props = defineProps<Props>()
    const sidebarPositionClass = computed(()=>{
        return "sidebar-"+props.position
    })
    //to check width prop with css patterns (ends with 'px', 'vw' or '%')
    const widthRegex = /^(\d+(?:\.\d*)?)px$|^(\d+(?:\.\d*)?)vw$|^(\d+(?:\.\d*)?)%$/
    //to check height prop with css patterns (ends with 'px', 'vh' or '%')
    const heightRegex = /^(\d+(?:\.\d*)?)px$|^(\d+(?:\.\d*)?)vh$|^(\d+(?:\.\d*)?)%$/
    //to check  bgcolor prop with hexadecimal color pattern in ex: #AABBCC
    const hexColorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/;
    //CALCULATED CSS VARIABLES
    const backgroundClr = computed(()=>{
        if(props.bgColor && hexColorRegex.test(props.bgColor)){
            return props.bgColor
        }else {
            return 'transparent'
        }
    })
    const width4Vertical = computed(()=>{
        if((props.position == "left" || props.position == "right")){
            if(props.width && widthRegex.test(props.width)){
                if(props.position == "left"){
                    return `calc(0px - calc(${props.width} + 100px))`
                } else {
                    return `calc(${props.width} + 100px)`
                }
            } else {
                return 'calc(50px + 30vw)'
            }
        } else {
            return ''
        }
    })
    const height4Horizontal = computed(()=>{
        if((props.position == "bottom")){
            if(props.height && heightRegex.test(props.height)){
                return `calc(${props.height} + 100px)`
            } else {
                return 'calc(30vh + 50px)'
            }
        } else {
            return ''
        }
    })
    /**
    Toggle sidebar visibility. 
    You can also use this function from outside of the component to handle toggle event. For more information visit the link. 
    @link https://vuejs.org/api/sfc-script-setup.html#defineexpose
    @param {MouseEvent} event 
    @return {void}
    */
    function toggleSidebar(event:MouseEvent): void{
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
    defineExpose({
        toggleSidebar
    })
</script>

<style scoped>
.sidebar{
    position: absolute;
    border-radius: 8px;
    padding: 4px;
    background-color: v-bind('backgroundClr');
    display: flex;
    flex-grow: 0;
    justify-content: space-between;
    transition: 1s;

}
.sidebar > .content-body{
    flex-grow: 1;
    padding: 0.5rem;
}
.sidebar.sidebar-left{
    top: 10px;
    left: 45px;
    z-index: 11;
    height: 90vh;
    flex-direction: column;
    min-width: 15vw;
    backdrop-filter: invert(100%);
}
.sidebar.sidebar-right{
    top:10px;
    right: 45px;
    z-index: 11;
    height: 90vh;
    flex-direction: column;
    min-width: 15vw;
    backdrop-filter: invert(100%);
}
.sidebar.sidebar-bottom{
    bottom: calc(10vh - 20px);
    left: 45px;
    right: 45px;
    z-index: 12;
    min-height: 15vh;
    flex-direction: column;
    background-color: rgba(210, 210, 210, 0.807);
}
.sidebar.sidebar-left.collapsed{
    transform: translateX(v-bind(width4Vertical));
}
.sidebar.sidebar-right.collapsed{
    transform: translateX(v-bind(width4Vertical));
}
.sidebar.sidebar-bottom.collapsed{
    transform: translateY(v-bind(height4Horizontal));
}
.sidebar > .header {
    min-height: 1.2rem;
    width: 100%;
    display: flex;
}
.sidebar.sidebar-left > .header {
    flex-direction: row-reverse;
}
.sidebar.sidebar-right > .header {
    flex-direction: row;
}
.sidebar.sidebar-bottom > .header {
    flex-direction: row-reverse;
}
</style>