<template>
    <div class="flex flex-col gap-2">
        <div class="flex flex-col gap-0.5">
            <h3 class="text-sm font-medium">{{ t("collab.control.buildingRegistration.title") }}</h3>
            <p class="text-xs text-muted">{{ t("collab.control.buildingRegistration.description") }}</p>
        </div>

        <!--
            Registering before a calibration is accepted would draw the target at the wrong size,
            and the operator would align a block to it anyway — producing a reference that is wrong
            with nothing on screen to say so. So the panel refuses rather than guessing a scale.
        -->
        <p v-if="scaleFactor === null" class="text-xs text-warning">
            {{ t("collab.control.buildingRegistration.needsCalibration") }}
        </p>

        <template v-else-if="registration.buildingId === null">
            <UInput
                v-model="query"
                size="xs"
                icon="i-lucide-search"
                :placeholder="t('collab.control.buildingRegistration.search')"
            />
            <ul class="flex max-h-40 flex-col gap-1 overflow-y-auto">
                <li
                    v-for="building in matches"
                    :key="building.buildingId"
                    class="flex items-center justify-between gap-2 text-xs"
                >
                    <span class="truncate">
                        {{ building.buildingId }}
                        <span v-if="building.registered" class="text-muted">
                            {{ t("collab.control.buildingRegistration.alreadyRegistered") }}
                        </span>
                    </span>
                    <UButton
                        :label="t('collab.control.buildingRegistration.select')"
                        icon="i-lucide-crosshair"
                        size="xs"
                        variant="soft"
                        @click="trackingRenderStore.startBuildingRegistration(building.buildingId)"
                    />
                </li>
                <li v-if="matches.length === 0" class="text-xs text-muted">
                    {{ t("collab.control.buildingRegistration.noMatches") }}
                </li>
            </ul>
        </template>

        <div v-else class="flex flex-col gap-2 rounded-md border border-info/60 p-2">
            <p class="text-xs font-medium">
                {{ t("collab.control.buildingRegistration.aiming", { buildingId: registration.buildingId }) }}
            </p>
            <!--
                The instruction is the measurement. Python sees an angle; it cannot tell whether
                the operator actually lined the block up, so this text is the only thing standing
                between a real reference and the arbitrary one the old tool recorded.
            -->
            <ol class="flex list-inside list-decimal flex-col gap-0.5 text-xs text-muted">
                <li>{{ t("collab.control.buildingRegistration.step1") }}</li>
                <li>{{ t("collab.control.buildingRegistration.step2") }}</li>
                <li>{{ t("collab.control.buildingRegistration.step3") }}</li>
            </ol>

            <!--
                The scan gate. Registration used to be one blind shot: press confirm and find out.
                The operator cannot see whether the cameras have picked their block out from where
                they are standing, so a refusal was the first news that anything was wrong. Here
                the server answers every cycle, and Register stays locked until it says the sample
                set is good -- so the button never promises something the registration refuses.
            -->
            <div class="flex flex-col gap-1">
                <UButton
                    v-if="registration.phase !== 'scanning'"
                    :label="t('collab.control.buildingRegistration.scan')"
                    icon="i-lucide-scan-eye"
                    size="xs"
                    block
                    @click="trackingRenderStore.scanRegistrationBlock()"
                />
                <template v-else>
                    <p v-if="registration.scannedMarkerId === null" class="text-xs text-warning">
                        {{ t("collab.control.buildingRegistration.scanSearching") }}
                    </p>
                    <p v-else class="text-xs" :class="registration.scanReady ? 'text-success' : 'text-muted'">
                        {{
                            t("collab.control.buildingRegistration.scanFound", {
                                markerId: registration.scannedMarkerId,
                                readings: registration.scanReadings,
                                required: registration.scanRequired,
                            })
                        }}
                    </p>
                </template>
            </div>

            <p
                v-if="registration.message"
                class="text-xs"
                :class="registration.phase === 'refused' ? 'text-error' : 'text-success'"
            >
                {{ registration.message }}
            </p>

            <div class="flex flex-wrap gap-1">
                <UButton
                    :label="t('collab.control.buildingRegistration.confirm')"
                    icon="i-lucide-check"
                    size="xs"
                    :disabled="!registration.scanReady"
                    :loading="registration.phase === 'sending'"
                    @click="trackingRenderStore.confirmBuildingRegistration()"
                />
                <UButton
                    :label="t('collab.control.buildingRegistration.cancel')"
                    icon="i-lucide-x"
                    size="xs"
                    variant="ghost"
                    @click="trackingRenderStore.cancelBuildingRegistration()"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * Registering a physical block against the building it stands for.
 *
 * The one thing registration must establish — how the ArUco marker is glued to the block relative
 * to the building — is not in the camera data and never can be: the same marker fixed straight,
 * sideways or upside down reads identically. The old terminal tool could not ask for it, so it
 * recorded whatever heading the block happened to be lying at and the system treated that as the
 * building's true-north orientation, wrong by up to 180 degrees and flagged nowhere.
 *
 * This panel asks for it the only way it can be asked: it projects the building's own footprint
 * onto the table at its real heading, and the operator answers by turning the block parallel to
 * it — on the outline and facing the same way. The heading is what gets recorded; the position is
 * how the server tells this block from the others already on the table. The panel used to say the
 * block could sit anywhere, which was true before blocks were identified by position and has been
 * wrong since: following that instruction produced a refusal the operator could not explain.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { collabBuildingDataset } from "../data/collabBuildingData";
import { useCollabSessionStore } from "../stores/collabSession";
import { useCollabTrackingRenderStore } from "../stores/collabTrackingRender";

const { t } = useI18n();
const trackingRenderStore = useCollabTrackingRenderStore();
const session = useCollabSessionStore();

const query = ref("");

const registration = computed(() => trackingRenderStore.buildingRegistration);
/**
 * From `session_state` if Python sent one, otherwise off any tracked building's published factor
 * — see the store's `registrationScaleFactor`. Reading the derived value rather than the raw ref
 * so the panel does not refuse to open against a server that predates `session_state`.
 */
const scaleFactor = computed(() => trackingRenderStore.registrationScaleFactor());

/** Which buildings already have a catalog entry, so the list can say so rather than look identical. */
const registeredIds = computed(
    () => new Set(Object.values(session.tracking).map((tracked) => tracked.cityScopeId))
);

/**
 * At most a screenful of matches. The catalog holds 78 buildings and the operator knows which one
 * is in their hand, so a filtered short list beats a scroll through all of them.
 */
const matches = computed(() => {
    const needle = query.value.trim().toUpperCase();
    return collabBuildingDataset()
        .footprints.features.map((feature) => ({
            buildingId: feature.properties.building_id,
            registered: registeredIds.value.has(feature.properties.city_scope_id),
        }))
        .filter((building) => needle === "" || building.buildingId.toUpperCase().includes(needle))
        .sort((a, b) => a.buildingId.localeCompare(b.buildingId))
        .slice(0, 12);
});
</script>
