import { metaConfig } from '../meta';
import type { AppDef } from './registry';

/** Saltbreak demo target: one supervised flow against the staff UI. */
export const saltbreakApp: AppDef = {
  id: 'saltbreak',
  description: 'Saltbreak Surf Co. demo storefront and staff tools',
  baseUrl: () => metaConfig().saltbreakUrl,
  flows: {
    'fulfill-backlog': {
      description: 'Fulfill one packing order through the staff UI',
      run: async (ctx) => {
        const { page } = ctx;
        await page.goto(`${ctx.baseUrl}/staff/orders`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: 'Orders' }).waitFor({ timeout: 15000 });
        await ctx.shot('shot-1-orders.png');
        ctx.record('open-orders', ['goto /staff/orders', 'screenshot shot-1-orders.png'], 'Orders list visible.', true);

        const links = page.getByRole('link', { name: /^SB-/ });
        const count = Math.min(await links.count(), 5);
        let orderNumber = '';
        let found = false;
        for (let i = 0; i < count; i++) {
          await links.nth(i).click();
          await page.waitForLoadState('domcontentloaded');
          const fulfill = page.getByRole('button', { name: 'Mark fulfilled' });
          if ((await fulfill.count()) > 0) {
            orderNumber = (await page.getByRole('heading', { level: 1 }).first().textContent()) ?? '';
            found = true;
            break;
          }
          await page.goBack({ waitUntil: 'domcontentloaded' });
        }
        if (!found) throw new Error('No packing order found in the first rows.');
        await ctx.shot('shot-2-order.png');
        ctx.record('open-order', ['click first packing order', 'screenshot shot-2-order.png'], `${orderNumber.trim()} open, fulfill action available.`, true);

        await page.getByRole('button', { name: 'Mark fulfilled' }).click();
        await page.getByText('Terminal state').waitFor({ timeout: 15000 });
        await ctx.shot('shot-3-fulfilled.png');
        ctx.record('fulfill', ['click Mark fulfilled', 'screenshot shot-3-fulfilled.png'], `${orderNumber.trim()} fulfilled, terminal state shown.`, true);
      },
    },
  },
};
