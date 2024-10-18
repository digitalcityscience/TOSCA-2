import { type IControl } from "maplibre-gl";

export class SidebarControl implements IControl {
    _className: string;
    _sidebarID: string;
    _container: HTMLDivElement;
    _map: any;
    _icon: HTMLSpanElement;
    _order: number;

    constructor(className = "", sidebarID = "", container: HTMLDivElement, icon?: HTMLSpanElement, order = 0) {
        this._order = order;
        this._className = className;
        this._sidebarID = sidebarID;
        this._container = container;
        if (icon === undefined){
            const el = document.createElement("span")
            el.classList.add("pi", "pi-database")
            this._icon = el
        } else {
            this._icon = icon
        }
    }

    onAdd(map: any): HTMLDivElement {
        this._map = map;
        this._container.className = `maplibregl-ctrl maplibregl-ctrl-group mapboxgl-ctrl mapboxgl-ctrl-group order-${this._order}`;
        const btn = this.createButton();
        this._container.addEventListener("contextmenu", function (e: Event) {
            e.preventDefault();
        });
        this._container.appendChild(btn);
        btn.addEventListener("click", (e) => {
            e.preventDefault()
            const sidebar: HTMLElement = document.getElementById(this._sidebarID)!
            if (sidebar !== null){
                const position = sidebar.dataset.position
                if (position !== undefined){
                    const alignedSidebars = document.querySelectorAll(`.sidebar-${position}`)
                    if (alignedSidebars.length > 1){
                        alignedSidebars.forEach(alignedSidebar => {
                            if (alignedSidebar !== sidebar) {
                                if (sidebar.classList.contains("collapsed")) {
                                    alignedSidebar.classList.add("collapsed")
                                }
                            }
                        })
                    }
                }
            }
            if (sidebar.classList.contains("collapsed")){
                sidebar.classList.remove("collapsed")
            } else {
                sidebar.classList.add("collapsed")
            }
        }
        );
        return this._container;
    }

    onRemove(): void {
        this._container.parentNode!.removeChild(this._container);
        this._map = undefined;
    }

    createButton(): HTMLButtonElement {
        const span = this._icon
        const btn = document.createElement("button");
        btn.className = "";
        btn.style.fontSize = "1.4rem";
        btn.appendChild(span);
        return btn;
    }
}
