import { System } from '@wailsio/runtime';

let devMobile = false;
try { devMobile = localStorage.getItem('zz-dev-mobile') === '1'; } catch {  }

export const isMobile = typeof window.wails?.invokeAsync === 'function' || System.IsMobile() || devMobile;

export const isMac = System.IsMac();
