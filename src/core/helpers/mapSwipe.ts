interface SwipeOptions {
    orientation?: "vertical" | "horizontal";
    initialPosition?: number;
}

export class MapSwipeController {
    private readonly container: HTMLElement;
    private readonly overlay: HTMLElement;
    private readonly orientation: "vertical" | "horizontal";
    private readonly slider: HTMLDivElement;
    private bounds: DOMRect;
    private position = 0;
    private dragging = false;
    private pointerId: number | null = null;
    private resizeObserver?: ResizeObserver;

    constructor(container: HTMLElement, overlay: HTMLElement, options: SwipeOptions = {}) {
        this.container = container;
        this.overlay = overlay;
        this.orientation = options.orientation ?? "vertical";
        this.slider = this.createSlider();
        this.container.appendChild(this.slider);
        this.bounds = this.container.getBoundingClientRect();
        const initialPosition = options.initialPosition ?? this.defaultPosition();
        this.setPosition(initialPosition);
        this.attachEvents();
    }

    destroy(): void {
        this.detachEvents();
        this.slider.remove();
        this.overlay.style.clipPath = "";
        (this.overlay.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = "";
    }

    private defaultPosition(): number {
        return this.orientation === "vertical"
            ? this.bounds.width / 2
            : this.bounds.height / 2;
    }

    private createSlider(): HTMLDivElement {
        const slider = document.createElement("div");
        slider.className = "comparison-slider";
        slider.setAttribute("role", "separator");
        slider.setAttribute("aria-orientation", this.orientation);
        slider.setAttribute("aria-valuemin", "0");
        slider.setAttribute("aria-valuemax", "100");
        slider.setAttribute("tabindex", "0");
        return slider;
    }

    private attachEvents(): void {
        this.slider.addEventListener("pointerdown", this.handlePointerDown);
        this.slider.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("pointermove", this.handlePointerMove);
        window.addEventListener("pointerup", this.handlePointerUp);
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => {
                this.bounds = this.container.getBoundingClientRect();
                this.setPosition(this.position);
            });
            this.resizeObserver.observe(this.container);
        }
    }

    private detachEvents(): void {
        this.slider.removeEventListener("pointerdown", this.handlePointerDown);
        this.slider.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("pointermove", this.handlePointerMove);
        window.removeEventListener("pointerup", this.handlePointerUp);
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
    }

    private readonly handlePointerDown = (event: PointerEvent): void => {
        event.preventDefault();
        this.dragging = true;
        this.pointerId = event.pointerId;
        this.slider.setPointerCapture?.(event.pointerId);
        this.bounds = this.container.getBoundingClientRect();
        this.updateFromEvent(event);
    };

    private readonly handlePointerMove = (event: PointerEvent): void => {
        if (!this.dragging) return;
        if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
        this.updateFromEvent(event);
    };

    private readonly handlePointerUp = (event: PointerEvent): void => {
        if (!this.dragging) return;
        if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
        this.dragging = false;
        if (this.pointerId !== null) {
            this.slider.releasePointerCapture?.(this.pointerId);
        }
        this.pointerId = null;
    };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        const STEP = 10;
        if (this.orientation === "vertical") {
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                this.setPosition(this.position - STEP);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                this.setPosition(this.position + STEP);
            }
        } else {
            if (event.key === "ArrowUp") {
                event.preventDefault();
                this.setPosition(this.position - STEP);
            } else if (event.key === "ArrowDown") {
                event.preventDefault();
                this.setPosition(this.position + STEP);
            }
        }
    };

    private updateFromEvent(event: PointerEvent): void {
        const position = this.orientation === "vertical"
            ? event.clientX - this.bounds.left
            : event.clientY - this.bounds.top;
        this.setPosition(position);
    }

    private setPosition(position: number): void {
        const max = this.orientation === "vertical" ? this.bounds.width : this.bounds.height;
        const clamped = Math.max(0, Math.min(position, max));
        this.position = clamped;
        const percent = max === 0 ? 0 : (clamped / max) * 100;
        this.slider.setAttribute("aria-valuenow", percent.toFixed(0));
        if (this.orientation === "vertical") {
            this.slider.style.left = `${clamped}px`;
            this.overlay.style.clipPath = `inset(0 0 0 ${clamped}px)`;
            (this.overlay.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = `inset(0 0 0 ${clamped}px)`;
        } else {
            this.slider.style.top = `${clamped}px`;
            this.overlay.style.clipPath = `inset(${clamped}px 0 0 0)`;
            (this.overlay.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = `inset(${clamped}px 0 0 0)`;
        }
    }
}
