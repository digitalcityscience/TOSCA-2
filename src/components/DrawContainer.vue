<template>
    <div>
        <OverlayPanel ref="op" :dismissable="false" showCloseIcon :pt="closeButtonStyles">
            <div class="flex flex-col min-w-72">
                <div class="w-full">
                    <Card>
                        <template #title>Create</template>
                        <template #subtitle>Select a mode and start drawing</template>
                        <template #content>
                                <div class="flex justify-between">
                                    <div v-for="draw in drawTypes" :key="draw.name" class="flex align-items-center">
                                        <RadioButton :disabled="drawOnProgress||editOnProgress" v-model="drawMode" :inputId="draw.name" :value="draw.name" />
                                        <label :for="draw.name" class="ml-2">{{ draw.mode }}</label>
                                    </div>
                                </div>
                        </template>
                        <template #footer>
                            <div class="w-full flex justify-between">
                                <Button size="small" class="col" @click="initDrawMode">
                                    <span v-if="!(drawOnProgress || editOnProgress)">Start Drawing</span>
                                    <span v-else>Continue</span>
                                </Button>
                                <Button size="small" v-if="(drawOnProgress || editOnProgress)" :disabled="!(drawOnProgress || editOnProgress)" @click="stopDrawMode">Cancel</Button>
                            </div>
                        </template>
                    </Card>
                </div>
                <div class="w-full pt-1">
                    <Card>
                        <template #title>Edit</template>
                        <template #subtitle>Edit your drawings</template>
                        <template #content>
                            <Button size="small" :disabled="!drawOnProgress" @click="editMode">Edit</Button>
                        </template>
                    </Card>
                </div>
                <div class="w-full pt-1">
                    <Card v-if="drawOnProgress || editOnProgress">
                        <template #title>Save</template>
                        <template #subtitle>Save your drawing as a Layer</template>
                        <template #content>
                            <InputText v-model="layerName" placeholder="Layer Name"></InputText>
                        </template>
                        <template #footer>
                            <Button size="small" @click="saveAsLayer" :disabled="layerName.length === 0">Add Layer</Button>
                        </template>
                    </Card>
                </div>
            </div>
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
import { useMapStore } from "../store/map";
import { DrawControl } from "../core/helpers/drawControl";
import { TerraDraw, TerraDrawLineStringMode, TerraDrawMapLibreGLAdapter, TerraDrawPointMode, TerraDrawPolygonMode, TerraDrawRectangleMode, TerraDrawSelectMode } from "terra-draw"
import { type FeatureCollection } from "geojson";
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
                        coordinates: {
                            deletable: true
                        }
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
        layerName.value = ""
    } else {
        console.error("Could not find drawing instance")
    }
}

// Saving draw result as a layer
function saveAsLayer(): void {
    const featureList = draw.getSnapshot()
    const processedLayerName = layerName.value.trim().toLowerCase().replaceAll(" ", "_")
    const isOnMap = mapStore.layersOnMap.filter((layer) => layer.id === processedLayerName).length > 0
    if (!isOnMap) {
        if ((featureList.length > 0)) {
            const geoJsonSnapshot: FeatureCollection = {
                type: "FeatureCollection",
                features: featureList
            }
            const geomType = mapStore.geometryConversion(featureList[0].geometry.type)
            const isFilterLayer = featureList[0].geometry.type === "Polygon"
            mapStore.addGeoJSONSrc(processedLayerName, geoJsonSnapshot).then(() => {
                mapStore.addGeoJSONLayer(processedLayerName, geomType, isFilterLayer, undefined, geoJsonSnapshot).then(() => {
                    stopDrawMode()
                }).catch(error => {
                    mapStore.map.value.removeSource(`drawsource-${processedLayerName}`)
                    window.alert(error)
                })
            }).catch((error) => {
                window.alert(error)
            })
        } else {
            window.alert("There is no feature drawn on map!")
        }
    } else {
        window.alert("Layer name already in use!")
    }
}
const layerName = ref("")

const closeButtonStyles= {
    closeButton:{
        class: [
            "absolute top-2 left-2 p-2",
            "rounded-full",
            "bg-transparent border",
            "text-primary-500 dark:text-primary-400",
            "hover:bg-primary-600 dark:hover:bg-primary-300 hover:border-primary-600 dark:hover:border-primary-300 text-primary-300 dark:text-primary-600",
            "focus:ring-primary-400/50 dark:focus:ring-primary-300/50"
        ]
    }
}
</script>

<style scoped></style>
