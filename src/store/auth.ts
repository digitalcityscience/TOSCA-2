import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", {
    state: () => ({
        accessToken: "",
    }),
    actions: {
        setAccessToken(token: string) {
            this.accessToken = token;
        },
        clearAccessToken() {
            this.accessToken = "";
        },
    },
    getters: {
        isAuthenticated: (state) => state.accessToken !== "",
        getAccessToken: (state) => state.accessToken,
    },
});

export async function exchangeAuthzCodeForAccessToken(
    authzCode: string
): Promise<string> {
    const redirectUrl = import.meta.env.VITE_OAUTH_REDIRECT_URL;
    const clientSecret = import.meta.env.VITE_OAUTH_CLIENT_SECRET;
    const clientId = import.meta.env.VITE_OAUTH_CLIENT_ID;
    const endpointUrl = import.meta.env.VITE_OAUTH_TOKEN_ENDPOINT;

    try {
        const res = await fetch(`${endpointUrl}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            },
            body: `client_id=${clientId}&grant_type=authorization_code&redirect_uri=${redirectUrl}&code=${authzCode}&client_secret=${clientSecret}`,
        });

        const tokens = await res.json();
        return tokens.access_token;
    } catch (error) {
        console.error("Failed to exchange authz code for access token", error);
        throw error;
    }
}
