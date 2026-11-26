import {expect,it} from 'vitest';
import {metaCurrencyDigits} from '../lib/meta/currency';
import {majorToMinor,displayMoney} from '../lib/meta/management/types';
import {budget as detailBudget} from '../lib/meta/campaign-detail';
import {cash} from '../lib/reports/daily-metrics';
import {money,planAmounts} from '../lib/reports/model';
it('uses official Meta offsets instead of locale currency display defaults',()=>{
 expect(metaCurrencyDigits('PKR')).toBe(2);expect(majorToMinor('1000.25','PKR')).toBe('100025');expect(displayMoney('100025','PKR')).toBe('PKR 1,000.25');expect(majorToMinor('1000','PKR')).toBe('100000');
 expect(metaCurrencyDigits('BHD')).toBe(2);expect(majorToMinor('1.23','BHD')).toBe('123');expect(()=>majorToMinor('1.234','BHD')).toThrow('2 decimal');expect(majorToMinor('1500','JPY')).toBe('1500');expect(()=>majorToMinor('1.2','JPY')).toThrow('0 decimal');
 expect(()=>metaCurrencyDigits('ZZZ')).toThrow('verified');
});
it('preserves paisa in reports and allocates PKR caps exactly in Meta subdivisions',()=>{
 expect(cash(27893.93,'PKR')).toBe('₨27,893.93');expect(money(27893.93,'PKR')).toContain('27,893.93');expect(planAmounts([{campaignId:'1',percent:50,rationale:''},{campaignId:'2',percent:50,rationale:''}],100.01,'PKR')).toEqual([50.01,50]);
});

it('keeps the same Meta currency units in audit ad-set budgets as the campaign editor',()=>{
 expect(detailBudget('100025','PKR')).toBe('PKR 1,000.25');expect(detailBudget('123','BHD')).toBe('BHD 1.23');expect(detailBudget('1500','JPY')).toBe('JPY 1,500');expect(detailBudget('0','PKR')).toBe('PKR 0.00');expect(detailBudget('invalid','PKR')).toBe('—');expect(detailBudget('1','ZZZ')).toBe('');expect(detailBudget(Number.MAX_SAFE_INTEGER+1,'CAD')).toBe('—');
});
