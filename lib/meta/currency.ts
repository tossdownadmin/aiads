/** Meta's API offsets are independent of locale/CLDR display preferences.
 * Verified 2026-11-27: https://developers.facebook.com/documentation/ads-commerce/marketing-api/currencies
 * In particular PKR uses offset 100; Intl currently defaults to zero display decimals.
 */
const unit = new Set(['CLP','COP','CRC','HUF','ISK','IDR','JPY','KRW','PYG','TWD','VND']);
const hundred = new Set(['DZD','ARS','AUD','BHD','BDT','BOB','BGN','BRL','GBP','CAD','CNY','HRK','CZK','DKK','EGP','EUR','GTQ','HNL','HKD','INR','ILS','JOD','KES','LVL','LTL','MOP','MYR','MXN','NZD','NIO','NGN','NOK','PKR','PEN','PHP','PLN','QAR','RON','RUB','SAR','RSD','SGD','SKK','ZAR','SEK','CHF','THB','TRY','AED','UAH','USD','UYU','VEF','FBZ','VES']);
export function metaCurrencyDigits(currency:string) {
  if(unit.has(currency))return 0;
  if(hundred.has(currency))return 2;
  throw Error('The currency is not in the verified Meta offset table.');
}
