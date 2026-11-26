import {expect,it} from 'vitest';
import {add,subtract,multiply,divide,decimal,formatDecimal,formatMoney,changePercent} from '../lib/monitoring/decimal';
it('preserves exact monetary sums, cancellation, fractions and large integers',()=>{
  expect(add('0.1','0.2')).toBe('0.3');expect(subtract('537.52','129.12')).toBe('408.4');expect(add('999999999999999999.99','0.01')).toBe('1000000000000000000');expect(multiply('0.000001','0.01')).toBe('0.00000001');
  expect(divide('129.12','470')).toBe('0.274723');expect(divide('1','0')).toBeNull();expect(divide('0','10')).toBe('0');expect(divide('-1','8')).toBe('-0.125');
});
it('rejects coercion, nonfinite, negative, exponent and unsafe source money',()=>{
  for(const value of [null,undefined,'',' ',false,'NaN','Infinity','1e6','-1','1,000',0.1,9007199254740992])expect(decimal(value)).toBeNull();
  expect(decimal('001.200')).toBe('1.2');expect(decimal(0)).toBe('0');
});
it('rounds display explicitly without changing source values or crossing currencies',()=>{
  expect(formatMoney('1.005','CAD')).toBe('CAD 1.01');expect(formatMoney('1234','JPY')).toBe('JPY 1,234');expect(formatDecimal('999999999999999999.999',2)).toBe('1,000,000,000,000,000,000.00');expect(formatDecimal('-0.004',2)).toBe('0.00');expect(changePercent('1','0')).toBeNull();expect(changePercent('80','100')).toBe('-20');
  expect(formatMoney('-0.01','CAD')).toBe('CAD -0.01');expect(formatDecimal('-0.125')).toBe('-0.125');
});
