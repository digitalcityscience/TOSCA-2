/* eslint "@typescript-eslint/indent": "off" */
/* eslint "no-tabs": "off" */
import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import { type GeoServerFeatureTypeAttribute } from "./geoserver";

export type IntegerFilters = ">" | ">=" | "<" | "<=" | "==" | "!=";
export type StringFilters = "==" | "!=" | "in";

export const useFilterStore = defineStore("filter", () => {
  const attributeList = ref<GeoServerFeatureTypeAttribute[]>([]);
  const integerFilters = [">", ">=", "<", "<=", "==", "!="];
  const stringFilters = ["==", "!=", "in"];
  const filterNames = {
    ">": "greater than",
    ">=": "greater than or equal to",
    "<": "less than",
    "<=": "less than or equal to",
    "==": "equal to",
    "!=": "not equal to",
    in: "in",
  };
  const allowedBindings = [
    "java.lang.String",
    "java.lang.Integer",
    "java.lang.Long",
    "java.lang.Double",
  ];
  return {
    attributeList,
    integerFilters,
    stringFilters,
    filterNames,
    allowedBindings,
  };
});
/* eslint-disable */
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFilterStore, import.meta.hot));
}
