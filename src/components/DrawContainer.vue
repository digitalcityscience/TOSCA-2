<template>
    <div>
        <OverlayPanel ref="op">
            <Card>
                <template #title>Create</template>
                <template #subtitle>Select a mode and start drawing</template>
                <template #content>
                    <div class="card flex justify-content-center">
                        <div class="flex flex-column gap-3">
                            <div v-for="draw in drawTypes" :key="draw.name" class="flex align-items-center">
                                <RadioButton v-model="drawMode" :inputId="draw.name" :value="draw.name" />
                                <label :for="draw.name" class="ml-2">{{ draw.mode }}</label>
                            </div>
                        </div>
                    </div>
                </template>
                <template #footer class="flex flex-column">
                    <Button @click="initDrawMode">
                        <span v-if="!editOnProgress">Start Drawing</span>
                        <span v-else>Continue Drawing</span>
                    </Button>
                    <Button @click="stopDrawMode">Cancel Drawing</Button>
                </template>
            </Card>
            <Card>
                <template #title>Edit</template>
                <template #subtitle>Edit your drawings</template>
                <template #footer>
                    <Button @click="editMode">Edit Drawing</Button>
                </template>
            </Card>
            <Card>
                <template #title>Save</template>
                <template #subtitle>Save your drawing as a Layer</template>
                <template #content>
                    <InputText v-model="layerName" placeholder="Layer Name"></InputText>
                </template>
                <template #footer>
                    <Button @click="saveAsLayer" :disabled="layerName.length === 0">Add Layer</Button>
                </template>
            </Card>
        </OverlayPanel>
    </div>
</template>

<script setup lang="ts">
import { type Map } from "maplibre-gl"
import Card from "primevue/card";
import RadioButton from "primevue/radiobutton";
import OverlayPanel from "primevue/overlaypanel";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { ref } from "vue";
import { type GeoJSONObject, useMapStore } from "../store/map";
import { DrawControl } from "../core/helpers/drawControl";
import { TerraDraw, TerraDrawLineStringMode, TerraDrawMapLibreGLAdapter, TerraDrawPointMode, TerraDrawPolygonMode, TerraDrawRectangleMode, TerraDrawSelectMode } from "terra-draw"
const mapStore = useMapStore()
// Overlay Panel operations
const op = ref()
function toggle(event: Event): void {
    op.value.toggle(event)
}

// Terradraw operations
const drawControl = new DrawControl(toggle)
if (mapStore.map !== null || mapStore.map !== undefined) {
    mapStore.map.addControl(drawControl, "top-right")
}
const drawTypes = ref([{ name: "point", mode: "Point" }, { name: "linestring", mode: "Line" }, { name: "polygon", mode: "Polygon" }])
const drawMode = ref("polygon")
const drawOnProgress = ref(false)
const editOnProgress = ref(false)
const terraMap = mapStore.map as unknown as Map
const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map: terraMap }),
    modes: [
        new TerraDrawRectangleMode({
            styles: {
                fillColor: "#454545",
                fillOpacity: 0.6,
                outlineColor: "#ff0000",
                outlineWidth: 2
            }
        }),
        new TerraDrawLineStringMode(),
        new TerraDrawPointMode({
            styles: {
                pointColor: "#AA4545",
                pointWidth: 6
            }
        }),
        new TerraDrawPolygonMode(),
        new TerraDrawSelectMode({
            flags: {
                point: {
                    feature: {
                        draggable: true,
                    },
                },
                polygon: {
                    feature: {
                        draggable: true,
                        coordinates: {
                            midpoints: true,
                            draggable: true,
                            deletable: true,
                        },
                    },
                },
                linestring: {
                    feature: {
                        draggable: true,
                        coordinates: {
                            midpoints: true,
                            draggable: true,
                            deletable: true,
                        },
                    },
                }
            }
        })
    ]
})
function initDrawMode(): void {
    if (draw !== null) {
        if (editOnProgress.value) {
            draw.setMode(drawMode.value)
            editOnProgress.value = false
            drawOnProgress.value = true
        } else {
            draw.start();
            draw.setMode(drawMode.value);
            drawOnProgress.value = true
            editOnProgress.value = false
        }
    } else {
        console.error("Could not find drawing instance")
    }
}
function editMode(): void {
    if (draw !== null) {
        draw.setMode("select");
        drawOnProgress.value = false
        editOnProgress.value = true
    } else {
        console.error("Could not find drawing instance")
    }
}
function stopDrawMode(): void {
    if (draw !== null && draw.enabled) {
        draw.setMode("static")
        draw.stop()
        drawOnProgress.value = false
        editOnProgress.value = false
    } else {
        console.error("Could not find drawing instance")
    }
}

// Saving draw result as a layer
function saveAsLayer(): void {
    const featureList = draw.getSnapshot()
    const geoJsonSnapshot: GeoJSONObject = {
        type: "FeatureCollection",
        features: featureList
    }
    console.log(geoJsonSnapshot)
    const geomType = mapStore.geometryConversion(featureList[0].geometry.type)
    mapStore.addGeoJSONSrc(layerName.value, geoJsonSnapshot).then(() => {
        mapStore.addGeoJSONLayer(layerName.value, geomType).then(() => {
            console.info(mapStore.map)
            stopDrawMode()
        }).catch(error => {
            console.log(mapStore.map.value.getStyle().layers)
            window.alert(error)
        })
    }).catch((error) => {
        window.alert(error)
    })
}
const layerName = ref("")
</script>

<style scoped></style>
