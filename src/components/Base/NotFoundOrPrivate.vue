<template>
    <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        :title="t('auth.notFoundTitle')"
        :description="isAuthenticated ? t('auth.maybePrivateSignedIn') : t('auth.maybePrivate')"
    >
        <template v-if="status === 'anonymous'" #actions>
            <UButton
                :label="loginPending ? t('auth.signingIn') : t('auth.login')"
                color="primary"
                size="sm"
                :loading="loginPending"
                @click="login"
            />
        </template>
    </UAlert>
</template>

<script setup lang="ts">
/**
 * Shown when the backend answers 404 for a story, event or simulation. It
 * answers 404 both for missing items and for private ones the caller may not
 * read, so a signed-out visitor is offered to log in. After login it emits
 * `retry`, so the view loads the item again with the user's rights.
 */
import { onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { authSession } from "../../auth/session";
import { useLogin } from "../../auth/useLogin";

const emit = defineEmits<{ retry: [] }>();
const { t } = useI18n();
const { login, loginPending, status, isAuthenticated } = useLogin();

// Signed in from here (or another tab): try again with the new rights.
onBeforeUnmount(authSession.onSessionChange((reason) => {
    if (reason === "login") emit("retry");
}));
</script>
