const GEONODE_API_BASE_URL = import.meta.env.VITE_GEONODE_REST_URL;
export const CAMPAIGNS_URL = `${GEONODE_API_BASE_URL}/v2/cpt/campaigns/`;
export const CAMPAIGN_FEEDBACK_URL = `${GEONODE_API_BASE_URL}/v2/cpt/campaigns/feedback/`;
export const getCampaignDetailUrl = (campaignURL: string): string => {
    return `${CAMPAIGNS_URL}/${campaignURL}`;
};
export const getFeedbackUrl = (campaignURL: string): string => {
    return `${CAMPAIGNS_URL}/${campaignURL}/feedback/`;
}
