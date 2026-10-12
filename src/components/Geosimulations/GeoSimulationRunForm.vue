<template>
    <div class="grid gap-4">
        <USkeleton v-if="loading" class="h-72 w-full rounded-lg" />
        <UAlert v-else-if="loadFailed" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('geosimulations.modelUnavailable')" />
        <UAlert
            v-else-if="model && !model.runnable"
            color="warning"
            variant="subtle"
            icon="i-lucide-circle-slash"
            :title="t('geosimulations.newRun.notRunnable')"
        />

        <form v-else-if="model" class="grid gap-4" novalidate @submit.prevent="submit">
            <div class="grid gap-1">
                <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ model.title }}</p>
                <h2 class="text-xl font-semibold leading-tight text-highlighted">{{ t("geosimulations.newRun.title") }}</h2>
                <p class="text-sm text-toned">{{ t("geosimulations.newRun.intro") }}</p>
            </div>

            <div class="grid gap-3">
                <UFormField
                    v-for="field in fields"
                    :key="field.name"
                    :name="field.name"
                    :label="field.title"
                    :description="field.description"
                    :hint="rangeHint(field)"
                    :error="fieldError(field.name)"
                    :required="field.required"
                >
                    <UInputNumber
                        v-if="field.kind === 'integer' || field.kind === 'number'"
                        :model-value="numberOf(field.name)"
                        class="w-full"
                        :min="field.minimum"
                        :max="field.maximum"
                        :step="field.kind === 'integer' ? 1 : 0.5"
                        :format-options="{ maximumFractionDigits: field.kind === 'integer' ? 0 : 2 }"
                        @update:model-value="(value: number | null | undefined) => setValue(field.name, value ?? null)"
                    />
                    <USelect
                        v-else-if="field.kind === 'enum'"
                        :model-value="values[field.name] as string"
                        class="w-full"
                        :items="optionItems(field)"
                        value-key="value"
                        @update:model-value="(value: unknown) => setValue(field.name, value as ParameterValue)"
                    />
                    <USwitch
                        v-else-if="field.kind === 'boolean'"
                        :model-value="values[field.name] === true"
                        @update:model-value="(value: boolean) => setValue(field.name, value)"
                    />
                    <UInput
                        v-else
                        :model-value="(values[field.name] as string | null) ?? ''"
                        class="w-full"
                        :type="field.kind === 'date' ? 'date' : 'text'"
                        @update:model-value="(value: string | number) => setValue(field.name, String(value))"
                    />
                </UFormField>
            </div>

            <details class="advanced">
                <summary class="cursor-pointer text-sm font-semibold text-highlighted">{{ t("geosimulations.newRun.advanced") }}</summary>
                <div class="mt-3 grid gap-3">
                    <UFormField name="title" :label="t('geosimulations.newRun.runTitle')" :hint="t('geosimulations.newRun.optional')">
                        <UInput v-model="title" class="w-full" :maxlength="255" :placeholder="model.title" />
                    </UFormField>
                    <UFormField
                        name="seed"
                        :label="t('geosimulations.newRun.seed')"
                        :description="t('geosimulations.newRun.seedHelp')"
                        :hint="t('geosimulations.newRun.optional')"
                    >
                        <UInputNumber v-model="seed" class="w-full" :min="0" :step="1" />
                    </UFormField>
                </div>
            </details>

            <UAlert
                v-if="submitError"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :title="submitError"
                :description="otherErrors.join(' ')"
            />

            <div class="flex flex-wrap items-center gap-3">
                <UButton type="submit" icon="i-lucide-play" :loading="submitting" :disabled="submitting" :label="t('geosimulations.newRun.start')" />
                <UButton color="neutral" variant="ghost" :label="t('geosimulations.newRun.reset')" @click="reset" />
            </div>
            <p class="text-xs text-muted">{{ t("geosimulations.newRun.anonymousNote") }}</p>
        </form>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
    type SimulationModelDetail,
    StartRunError,
    useGeosimulationStore,
} from "@store/geosimulation";
import {
    initialParameterValues,
    type ParameterField,
    type ParameterProblem,
    type ParameterValue,
    parameterFields,
    serverParameterErrors,
    submittedParameters,
    validateParameterValues,
} from "@helpers/simulationParameters";
import { rememberRun } from "@helpers/simulationMyRuns";
import { formatNumber } from "@helpers/simulationFormat";

const props = defineProps<{ modelId: string }>();
const { t, locale } = useI18n();
const router = useRouter();
const geosimulation = useGeosimulationStore();

const model = ref<SimulationModelDetail>();
const loading = ref(false);
const loadFailed = ref(false);
const submitting = ref(false);
const submitError = ref("");
const otherErrors = ref<string[]>([]);
const serverErrors = ref<Record<string, string>>({});
const problems = ref<Record<string, ParameterProblem>>({});
const values = reactive<Record<string, ParameterValue>>({});
const title = ref("");
const seed = ref<number | null>(null);

const fields = computed(() => parameterFields(model.value?.parameter_schema));

function numberOf(name: string): number | undefined {
    const value = values[name];
    return typeof value === "number" ? value : undefined;
}

function setValue(name: string, value: ParameterValue): void {
    values[name] = value;
    // A changed field drops its old error until the next submit.
    delete problems.value[name];
    delete serverErrors.value[name];
}

function reset(): void {
    Object.keys(values).forEach((name) => delete values[name]);
    Object.assign(values, initialParameterValues(fields.value, model.value?.default_parameters));
    title.value = "";
    seed.value = null;
    problems.value = {};
    serverErrors.value = {};
    submitError.value = "";
    otherErrors.value = [];
}

function optionItems(field: ParameterField): Array<{ label: string; value: string | number | boolean }> {
    return (field.options ?? []).map((option) => ({ label: String(option).replaceAll("_", " "), value: option }));
}

function rangeHint(field: ParameterField): string | undefined {
    if (field.minimum === undefined || field.maximum === undefined) return undefined;
    return t("geosimulations.newRun.range", {
        min: formatNumber(field.minimum, locale.value),
        max: formatNumber(field.maximum, locale.value),
    });
}

function fieldError(name: string): string | undefined {
    const problem = problems.value[name];
    if (problem !== undefined) {
        return t(`geosimulations.newRun.problem.${problem.code}`, "limit" in problem ? { limit: formatNumber(problem.limit, locale.value) } : {});
    }
    return serverErrors.value[name];
}

async function submit(): Promise<void> {
    if (model.value === undefined) return;
    serverErrors.value = {};
    submitError.value = "";
    otherErrors.value = [];
    problems.value = validateParameterValues(fields.value, values);
    if (Object.keys(problems.value).length > 0) return;
    submitting.value = true;
    try {
        const run = await geosimulation.startRun(model.value.id, {
            parameters: submittedParameters(values),
            seed: seed.value,
            ...(title.value.trim() !== "" ? { title: title.value.trim() } : {}),
        });
        rememberRun({ id: run.id, modelId: model.value.id, title: run.title, startedAt: run.created_at });
        await router.push({
            name: "geosimulation-run",
            params: { runId: run.id },
            query: run.reused ? { reused: "1" } : {},
        });
    } catch (error) {
        if (!(error instanceof StartRunError)) throw error;
        const split = serverParameterErrors(error.parameterErrors, fields.value);
        serverErrors.value = split.byField;
        otherErrors.value = split.other;
        if (error.status === 429) {
            const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
            submitError.value = t("geosimulations.newRun.quota", { detail: error.message, minutes });
        } else if (error.status === 400) {
            submitError.value = t("geosimulations.newRun.invalid");
        } else {
            submitError.value = error.status === 0 ? error.message : t("geosimulations.newRun.failed", { detail: error.message });
        }
    } finally {
        submitting.value = false;
    }
}

watch(() => props.modelId, async (modelId) => {
    loading.value = true;
    loadFailed.value = false;
    try {
        model.value = await geosimulation.loadModel(modelId);
        reset();
    } catch {
        loadFailed.value = true;
    } finally {
        loading.value = false;
    }
}, { immediate: true });
</script>

<style scoped>
.advanced {
    padding: 0.6rem 0.75rem;
    border: 1px solid rgb(148 163 184 / 0.2);
    border-radius: 0.4rem;
}
</style>
