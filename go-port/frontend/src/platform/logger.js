import { Roarr, getLogLevelName } from 'roarr';

const LEVEL_COLORS = {
  trace: 'var(--text-muted)',
  debug: 'var(--accent)',
  info:  'var(--green)',
  warn:  'var(--orange)',
  error: 'var(--red)',
  fatal: '#ff0000',
};

const LEVEL_METHODS = {
  trace: 'debug',
  debug: 'debug',
  info:  'info',
  warn:  'warn',
  error: 'error',
  fatal: 'error',
};

function isEnabled(namespace, logLevel) {
  try {
    if (localStorage.getItem('debug:*') === '1') return logLevel >= getMinLevel();
    if (localStorage.getItem(`debug:${namespace}`) === '1') return logLevel >= getMinLevel();
    return false;
  } catch {
    return false;
  }
}

function getMinLevel() {
  try {
    const level = localStorage.getItem('debug:level');
    return level ? parseInt(level, 10) : 20;
  } catch {
    return 20;
  }
}

export function createLogger(namespace) {
  return Roarr.child({ namespace });
}

let traceSink = null;

export function setTraceSink(sink) { traceSink = typeof sink === 'function' ? sink : null; }

export function writeTraceLine(level, area, message) {
  try { traceSink?.(level, area, message); } catch {  }
}

function fmtField(v) {
  if (v == null) return String(v);
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 77)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  try {
    const j = JSON.stringify(v);
    return j.length > 80 ? `${j.slice(0, 77)}…` : j;
  } catch { return '<unserialisable>'; }
}

export function initLogger() {
  globalThis.ROARR = globalThis.ROARR || {};
  globalThis.ROARR.write = (serialized) => {
    try {
      const msg = JSON.parse(serialized);
      const { context, message, time } = msg;
      const namespace = context?.namespace || '?';
      const logLevel = context?.logLevel || 30;
      const levelName = getLogLevelName(logLevel) || 'info';

      if (!isEnabled(namespace, logLevel)) return;

      try {
        if (traceSink) {
          const extra = Object.keys(context || {})
            .filter((k) => k !== 'namespace' && k !== 'logLevel')
            .map((k) => `${k}=${fmtField(context[k])}`)
            .join(' ');
          traceSink(levelName, namespace, extra ? `${message} ${extra}` : message);
        }
      } catch {  }

      const ts = new Date(time).toISOString().slice(11, 23);
      const color = LEVEL_COLORS[levelName] || 'var(--text-secondary)';
      const method = LEVEL_METHODS[levelName] || 'log';

      const ctx = { ...context };
      delete ctx.namespace;
      delete ctx.logLevel;
      const hasCtx = Object.keys(ctx).length > 0;

      if (hasCtx) {
        console[method](
          `%c${ts} %c${levelName.toUpperCase().padEnd(5)} %c[${namespace}]%c ${message}`,
          'color:var(--text-faint)', `color:${color};font-weight:bold`, 'color:#bb9af7', 'color:inherit',
          ctx
        );
      } else {
        console[method](
          `%c${ts} %c${levelName.toUpperCase().padEnd(5)} %c[${namespace}]%c ${message}`,
          'color:var(--text-faint)', `color:${color};font-weight:bold`, 'color:#bb9af7', 'color:inherit'
        );
      }
    } catch {
      console.log('[roarr]', serialized);
    }
  };

  if (typeof window !== 'undefined') {
    window.zzDebug = {
      enable(ns)  { localStorage.setItem(`debug:${ns}`, '1'); console.log(`✅ debug:${ns} enabled`); },
      disable(ns) { localStorage.removeItem(`debug:${ns}`); console.log(`❌ debug:${ns} disabled`); },
      all()       { localStorage.setItem('debug:*', '1'); console.log('✅ all loggers enabled'); },
      none()      { localStorage.removeItem('debug:*'); console.log('❌ all loggers disabled'); },
      level(n)    { localStorage.setItem('debug:level', String(n)); console.log(`📊 min level: ${n} (${getLogLevelName(n)})`); },
      status() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.startsWith('debug:')) keys.push(`${key} = ${localStorage.getItem(key)}`);
        }
        console.log(keys.length ? keys.join('\n') : 'No debug flags set. Use zzDebug.enable("auth")');
      },
    };
  }
}
