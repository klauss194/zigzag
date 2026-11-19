export function humanError(e, errors) {
  const msg = String(e?.message || e);
  for (const name in errors) if (msg.includes(name)) return errors[name];
  return msg;
}
