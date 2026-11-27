type Row=Record<string,unknown>;

/** Current Meta configuration, never an inference from a client or campaign name. */
export function configuredOutcome(set:Row):{metric:string;label:string;scale:string}|null {
  const goal=String(set.optimization_goal||''),promoted=set.promoted_object as Row|undefined;
  const direct:Record<string,[string,string,string]>={
    REACH:['reach','Reach','1000'],IMPRESSIONS:['impressions','Impressions','1000'],
    THRUPLAY:['thruplays','ThruPlays','1'],LINK_CLICKS:['linkClicks','Link clicks','1'],
    LANDING_PAGE_VIEWS:['landingViews','Landing page views','1'],
    VISIT_INSTAGRAM_PROFILE:['instagramVisits','Instagram profile visits','1'],
    CONVERSATIONS:['conversations','Conversations started','1'],
    LEAD_GENERATION:['onMetaLeads','On-Meta leads','1'],
    POST_ENGAGEMENT:['postEngagement','Post engagements','1'],
    APP_INSTALLS:['appInstalls','App installs','1'],
  };
  if(direct[goal]){const [metric,label,scale]=direct[goal];return {metric,label,scale};}
  // A broad Sales/Leads objective does not identify its conversion event or location.
  if(['OFFSITE_CONVERSIONS','VALUE'].includes(goal)&&promoted?.pixel_id&&!promoted.custom_conversion_id&&!promoted.application_id) {
    if(promoted.custom_event_type==='PURCHASE')return {metric:'websitePurchases',label:'Website purchases',scale:'1'};
    if(promoted.custom_event_type==='LEAD')return {metric:'websiteLeads',label:'Website leads',scale:'1'};
    if(promoted.custom_event_type==='ADD_TO_CART')return {metric:'websiteAddsToCart',label:'Website adds to cart',scale:'1'};
    if(['INITIATE_CHECKOUT','INITIATED_CHECKOUT'].includes(String(promoted.custom_event_type)))return {metric:'websiteCheckouts',label:'Website checkouts initiated',scale:'1'};
  }
  if(['PROFILE_VISIT','PROFILE_AND_PAGE_ENGAGEMENT'].includes(goal)) {
    if(set.destination_type==='INSTAGRAM_PROFILE')return {metric:'instagramVisits',label:'Instagram profile visits',scale:'1'};
    if(set.destination_type==='FACEBOOK_PAGE')return {metric:'facebookVisits',label:'Facebook Page visits',scale:'1'};
  }
  // PROFILE_VISIT can include Facebook/Instagram. Do not substitute link clicks or
  // choose a platform from whichever action happened to be returned.
  return null;
}

