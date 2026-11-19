export function connectNativeFileDrop(target, { over, leave, drop }, runtime = globalThis.window?._wails,
  doc = globalThis.document) {
  if (!runtime?.flags?.enableFileDrop) return null;
  const names = ['handleDragEnter', 'handleDragOver', 'handleDragLeave', 'handlePlatformFileDrop'];
  const previous = names.map((name) => runtime[name]);
  let active = false, dropping = false;
  const cancel = () => {
    active = dropping = false;
    previous[2]?.call(runtime);
  };
  const hit = (x, y) => {
    let node = doc.elementFromPoint(x, y);
    const path = [];
    while (node) {
      path.push(node);
      const inner = node.shadowRoot?.elementFromPoint(x, y);
      if (!inner || inner === node) break;
      node = inner;
    }
    for (let ancestor = node?.parentNode || node?.getRootNode?.()?.host; ancestor;
      ancestor = ancestor.parentNode || ancestor.host) path.push(ancestor);
    const inside = path.some((element) => element === target || target.contains(element));
    return { inside, composedPath: () => path };
  };
  const handlers = [
    (...args) => { active = dropping = true; previous[0]?.apply(runtime, args); },
    (x, y) => {
      if (!active) return;
      previous[1]?.call(runtime, x, y);
      const e = hit(x, y);
      e.inside ? over(e) : leave();
    },
    () => { active = false; previous[2]?.call(runtime); leave(); },
    (paths, x, y) => {
      if (!dropping) return;
      cancel();
      const e = hit(x, y);
      leave();
      if (e.inside) drop(paths, e);
    },
  ];
  names.forEach((name, i) => { runtime[name] = handlers[i]; });
  return { cancel, disconnect() {
    cancel();
    names.forEach((name, i) => {
      if (runtime[name] === handlers[i]) runtime[name] = previous[i];
    });
  } };
}
