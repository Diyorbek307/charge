import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../server/phrases.js';

test('notifications follow the app language', () => {
  assert.equal(translate('✅ Зарядка завершена', 'en'), '✅ Charging finished');
  assert.equal(translate('Зарядка завершена', 'ru'), 'Зарядка завершена');
  assert.equal(translate('Yunusobod Mall Charge · 4.8 кВт·ч · 10 800 сум', 'en'), 'Yunusobod Mall Charge · 4.8 kWh · 10 800 UZS');
  assert.equal(translate('⚡ 82% · ещё ~4 мин', 'uz'), '⚡ 82% · yana ~4 daq');
  assert.equal(translate('Зарядка до 80% завершена · Yunusobod. Освободите место для следующего водителя', 'en'), 'Charge to 80% complete · Yunusobod. Please free the spot for the next driver');
  // An unknown piece stays Russian, the rest is still translated.
  assert.equal(translate('Ваша очередь подошла · Нечто новое', 'en'), 'Your turn has come · Нечто новое');
});
