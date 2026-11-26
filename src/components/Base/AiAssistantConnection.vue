<!--
  "Connect AI assistant": shows the pairing code the user tells their assistant
  (ChatGPT, Claude) and, while an assistant is connected, a header button that
  makes this visible and lets the user end it.
-->
<template>
  <UTooltip v-if="aiBridge.active" :text="t('aiBridge.headerHint')">
    <UButton
      size="sm"
      :color="isPaired ? 'success' : 'neutral'"
      variant="soft"
      icon="i-lucide-bot"
      :label="isPaired ? t('aiBridge.connectedShort') : t('aiBridge.waitingShort')"
      @click="open = true"
    />
  </UTooltip>
  <UModal v-model:open="open" :title="t('aiBridge.title')" :ui="{ content: 'max-w-[28rem]' }">
    <template #body>
      <div class="space-y-4" aria-live="polite">
        <p class="text-sm text-muted">{{ t('aiBridge.intro') }}</p>

        <div v-if="state.status === 'connecting' || state.status === 'reconnecting'" class="flex items-center gap-2 text-sm">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          {{ state.status === 'connecting' ? t('aiBridge.connecting') : t('aiBridge.reconnecting') }}
        </div>

        <div v-else-if="state.status === 'waiting'" class="space-y-3">
          <template v-if="state.code && secondsLeft > 0">
            <p class="text-sm">{{ t('aiBridge.tellCode') }}</p>
            <div class="flex items-center justify-between gap-3 rounded-md border border-default bg-elevated px-4 py-3">
              <span class="font-mono text-2xl font-semibold tracking-widest" data-testid="ai-bridge-code">{{ state.code }}</span>
              <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-copy" :label="t('aiBridge.copy')" @click="copyCode" />
            </div>
            <p class="text-xs text-muted">{{ t('aiBridge.codeValidFor', { time: timeLeft }) }}</p>
          </template>
          <template v-else>
            <p class="text-sm">{{ t('aiBridge.codeExpired') }}</p>
            <UButton size="sm" icon="i-lucide-refresh-cw" :label="t('aiBridge.newCode')" @click="aiBridge.requestNewCode()" />
          </template>
        </div>

        <UAlert
          v-else-if="state.status === 'paired'"
          color="success"
          variant="subtle"
          icon="i-lucide-bot"
          :title="t('aiBridge.connected')"
          :description="t('aiBridge.connectedDetail', { count: state.commandCount }, state.commandCount)"
        />

        <UAlert
          v-else-if="state.status === 'error'"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t(`aiBridge.errors.${state.error ?? 'unavailable'}`)"
        />

        <p class="text-xs text-muted">{{ t('aiBridge.scopeNote') }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton size="sm" color="neutral" variant="soft" @click="open = false">{{ t('common.close') }}</UButton>
        <UButton v-if="state.status === 'error'" size="sm" @click="aiBridge.connect()">{{ t('aiBridge.retry') }}</UButton>
        <UButton v-else-if="aiBridge.active" size="sm" color="error" variant="soft" @click="disconnect">
          {{ t('aiBridge.disconnect') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "@helpers/toast";
import { useAiBridgeStore } from "@store/aiBridge";

const { t } = useI18n();
const toast = useToast();
const aiBridge = useAiBridgeStore();
const state = computed(() => aiBridge.state);
const isPaired = computed(() => state.value.status === "paired");
const open = ref(false);

const clock = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;
watch(open, (isOpen) => {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = isOpen ? setInterval(() => { clock.value = Date.now(); }, 1000) : undefined;
    clock.value = Date.now();
});
onBeforeUnmount(() => {
    if (ticker !== undefined) clearInterval(ticker);
});

const secondsLeft = computed(() => Math.max(0, Math.ceil(((state.value.codeExpiresAt ?? 0) - clock.value) / 1000)));
const timeLeft = computed(() => `${Math.floor(secondsLeft.value / 60)}:${String(secondsLeft.value % 60).padStart(2, "0")}`);

/** Opens the dialog and, when nothing is connected yet, asks for a pairing code. */
function start(): void {
    open.value = true;
    if (!aiBridge.active) aiBridge.connect();
}

function disconnect(): void {
    aiBridge.disconnect();
    open.value = false;
}

function copyCode(): void {
    const code = state.value.code;
    if (code === undefined) return;
    void navigator.clipboard?.writeText(code).then(
        () => toast.add({ severity: "success", summary: t("aiBridge.copied"), life: 2000 }),
        () => undefined
    );
}

defineExpose({ start });
</script>
