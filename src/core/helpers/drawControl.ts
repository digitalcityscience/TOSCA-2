import { type IControl } from "maplibre-gl";
type AnyFunction = (...args: any[]) => any;
export class DrawControl implements IControl {
    _map: any;
    _container: HTMLDivElement
    _eventHandler: AnyFunction
    constructor(eventHandler: AnyFunction){
        this._container = document.createElement("div")
        this._eventHandler = eventHandler
    }

    onAdd(map: any): HTMLDivElement {
        this._map = map;
        this._container.className = "maplibregl-ctrl maplibregl-ctrl-group mapboxgl-ctrl mapboxgl-ctrl-group";
        const btn = this.createButton();
        this._container.addEventListener("contextmenu", function (e: Event) {
            e.preventDefault();
        });
        this._container.appendChild(btn);
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            return this._eventHandler(e)
        });
        return this._container;
    }

    onRemove(): void {
        this._container.parentNode!.removeChild(this._container);
        this._map = undefined;
    }

    createIcon(): HTMLElement {
        const icon = document.createElement("span");
        icon.className = "pi pi-pencil";
        icon.setAttribute("aria-hidden", "true");
        return icon;
    }

    createButton(): HTMLButtonElement {
        const span = this.createIcon();
        const btn = document.createElement("button");
        btn.className = "";
        btn.style.fontSize = "1.4rem";
        btn.appendChild(span);
        return btn;
    }
}
