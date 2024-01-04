import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import { type GeoServerFeatureTypeAttribute } from './geoserver'

export type IntegerFilters = ">" | ">=" | "<" | "<=" | "==" | "!="
export type StringFilters = "==" | "!=" | "in"

export const useFilterStore = defineStore('filter', () => {

const attributeList  = ref<Array<GeoServerFeatureTypeAttribute>>([])
const integerFilters = [">",">=","<","<=","==","!="]
const stringFilters = ["==","!=","in"]
const allowedBindings = [
    "java.lang.String",
    "java.lang.Integer",
    "java.lang.Long",
    "java.lang.Double"
  ];
 return {
    attributeList,
    integerFilters,
    stringFilters,
    allowedBindings
 }
})

if (import.meta.hot) {
 import.meta.hot.accept(acceptHMRUpdate(useFilterStore, import.meta.hot))
}
