export type SlideoverSidebarSide = "left" | "right" | "top" | "bottom"

export interface SlideoverSidebarController {
    id: string
    side: SlideoverSidebarSide
    open: () => void
    close: () => void
    toggle: () => void
    collapse: () => void
    expand: () => void
    isOpen: () => boolean
}

const controllers = new Map<string, SlideoverSidebarController>()

function closeSidebarsOnSide(side: SlideoverSidebarSide, exceptId: string): void {
    controllers.forEach((controller) => {
        if (controller.side === side && controller.id !== exceptId) {
            controller.close()
        }
    })
}

export function registerSlideoverSidebar(controller: SlideoverSidebarController): () => void {
    controllers.set(controller.id, controller)
    return () => {
        controllers.delete(controller.id)
    }
}

export function openSlideoverSidebar(id: string): void {
    const controller = controllers.get(id)
    if (controller === undefined) return
    closeSidebarsOnSide(controller.side, controller.id)
    controller.open()
}

export function closeSlideoverSidebar(id: string): void {
    controllers.get(id)?.close()
}

export function toggleSlideoverSidebar(id: string): void {
    const controller = controllers.get(id)
    if (controller === undefined) return
    if (controller.isOpen()) {
        controller.close()
    } else {
        openSlideoverSidebar(id)
    }
}

export function closeSlideoverSidebars(side: SlideoverSidebarSide): void {
    controllers.forEach((controller) => {
        if (controller.side === side) {
            controller.close()
        }
    })
}
