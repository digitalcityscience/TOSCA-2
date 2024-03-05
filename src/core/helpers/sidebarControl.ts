import { type IControl } from "maplibre-gl";

export class SidebarControl implements IControl {
    _className: string;
    _sidebarID: string;
    _container: HTMLDivElement;
    _map: any;
    _icon: string

    constructor(className = "", sidebarID = "", container: HTMLDivElement, icon?: string) {
        this._className = className;
        this._sidebarID = sidebarID;
        this._container = container;
        this._icon = icon ?? "pi pi-database"
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
            e.preventDefault()
            const sidebar: HTMLElement = document.getElementById(this._sidebarID)!
            if (sidebar !== null){
                if (sidebar.classList.contains("collapsed")){
                    sidebar.classList.remove("collapsed")
                } else {
                    sidebar.classList.add("collapsed")
                }
            }
        });
        return this._container;
    }

    onRemove(): void {
        this._container.parentNode!.removeChild(this._container);
        this._map = undefined;
    }

    createIcon(): HTMLElement {
        const icon = document.createElement("span");
        icon.className = this._icon;
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
