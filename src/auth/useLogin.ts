import { useI18n } from "vue-i18n";
import { useToast } from "../core/helpers/toast";
import { useAuth, type LoginResult } from "./session";

/**
 * Starts the popup login and tells the user when the browser blocked the
 * popup or the sign-in failed. Call `login` straight from a click handler:
 * browsers only allow popups opened during a user gesture.
 */
export function useLogin() {
    const auth = useAuth();
    const toast = useToast();
    const { t } = useI18n();

    function login(): void {
        void auth.login().then((result: LoginResult) => {
            if (result === "blocked") {
                toast.add({ severity: "warn", summary: t("auth.popupBlocked"), detail: t("auth.popupBlockedDetail"), life: 8000 });
            } else if (result === "failed") {
                toast.add({ severity: "error", summary: t("auth.loginFailed"), life: 6000 });
            }
        });
    }

    return { login, loginPending: auth.loginPending, status: auth.status, isAuthenticated: auth.isAuthenticated };
}
