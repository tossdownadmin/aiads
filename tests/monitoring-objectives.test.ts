import {expect,it} from 'vitest';
import {campaignConfiguration,configuredOutcome} from '../lib/monitoring/objectives';
it('uses a Meta optimization goal and explicit conversion event, never a broad campaign label',()=>{
 expect(configuredOutcome({optimization_goal:'OFFSITE_CONVERSIONS',promoted_object:{pixel_id:'1',custom_event_type:'PURCHASE'}})?.metric).toBe('websitePurchases');
 expect(configuredOutcome({optimization_goal:'OFFSITE_CONVERSIONS',promoted_object:{pixel_id:'1',custom_event_type:'ADD_TO_CART'}})?.metric).toBe('websiteAddsToCart');
 expect(configuredOutcome({optimization_goal:'OFFSITE_CONVERSIONS'})).toBeNull();
 expect(configuredOutcome({optimization_goal:'VALUE',promoted_object:{pixel_id:'1',custom_event_type:'PURCHASE',custom_conversion_id:'9'}})).toBeNull();
 expect(configuredOutcome({optimization_goal:'QUALITY_LEAD'})).toBeNull();
 expect(configuredOutcome({optimization_goal:'PROFILE_VISIT'})).toBeNull();
 expect(configuredOutcome({optimization_goal:'VISIT_INSTAGRAM_PROFILE'})?.metric).toBe('instagramVisits');
 expect(configuredOutcome({optimization_goal:'THRUPLAY'})?.metric).toBe('thruplays');
 expect(configuredOutcome({optimization_goal:'LEAD_GENERATION'})?.metric).toBe('onMetaLeads');
});
it('ignores old non-delivering ad sets but rejects mixed, incomplete and wrong-parent settings',()=>{
 const campaign={campaign_id:'1',spend:'100',objective:'OUTCOME_SALES'};
 const sets=[{id:'2',campaign_id:'1',optimization_goal:'REACH'},{id:'3',campaign_id:'1',optimization_goal:'THRUPLAY'}];
 const ads=[{ad_id:'4',campaign_id:'1',adset_id:'2',spend:'100',impressions:'1000'}];
 expect(campaignConfiguration(campaign,sets,ads).outcome?.metric).toBe('reach');
 expect(campaignConfiguration(campaign,sets,[{...ads[0],spend:'50'},{ad_id:'5',campaign_id:'1',adset_id:'3',spend:'50',impressions:'1000'}]).state).toBe('mixed');
 expect(campaignConfiguration(campaign,sets,[{...ads[0],spend:'99.99'}]).state).toBe('unavailable');
 expect(campaignConfiguration(campaign,[{...sets[0],campaign_id:'wrong'}],ads).state).toBe('unavailable');
 expect(campaignConfiguration(campaign,null,ads).state).toBe('unavailable');
});
it('requires an explicit profile destination and recognizes the exact checkout event',()=>{
 expect(configuredOutcome({optimization_goal:'PROFILE_VISIT',destination_type:'INSTAGRAM_PROFILE'})?.metric).toBe('instagramVisits');
 expect(configuredOutcome({optimization_goal:'PROFILE_VISIT',destination_type:'FACEBOOK_PAGE'})?.metric).toBe('facebookVisits');
 expect(configuredOutcome({optimization_goal:'PROFILE_VISIT',destination_type:'INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE'})).toBeNull();
 expect(configuredOutcome({optimization_goal:'OFFSITE_CONVERSIONS',promoted_object:{pixel_id:'1',custom_event_type:'INITIATE_CHECKOUT'}})?.metric).toBe('websiteCheckouts');
});
