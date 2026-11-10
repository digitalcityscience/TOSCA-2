import { UserManager } from "oidc-client-ts";
import { createUserManagerSettings, readAuthConfig } from "./config";

/**
 * Safari crashes (segfault in its "save password" handling) when the login
 * popup closes right after the Keycloak form was submitted: its async
 * form-submit handler then runs against a window that no longer exists. So
 * the popup stays open a moment after handing over the code, then closes
 * itself.
 */
const POPUP_CLOSE_DELAY_MS = 1500;

function isLoginPopup(): boolean {
    return window.opener !== null && window.parent === window;
}

function closeSoon(): void {
    document.body.textContent = "Signed in. This window closes in a moment.";
    window.setTimeout(() => window.close(), POPUP_CLOSE_DELAY_MS);
}

/**
 * Runs in `auth-callback.html`, the page Keycloak returns to inside the
 * login popup or the silent-renew iframe. It hands the authorization code to
 * the opening app window (which exchanges it).
 */
async function finishSignin(manager: UserManager): Promise<void> {
    if (isLoginPopup()) {
        // keepOpen: the app window must not close the popup immediately.
        await manager.signinPopupCallback(window.location.href, true);
        closeSoon();
    } else {
        await manager.signinCallback();
    }
}

const config = readAuthConfig();
if (config === undefined) {
    document.body.textContent = "Sign-in is not configured.";
} else {
    // Only the app window renews tokens; the callback page just hands over the code.
    const settings = { ...createUserManagerSettings(config), automaticSilentRenew: false };
    finishSignin(new UserManager(settings)).catch((error: unknown) => {
        console.error("Sign-in callback failed", error);
        document.body.textContent = "Sign-in failed. You can close this window.";
    });
}
