export const moduleViews = [];

export function registerView(view) {
  moduleViews.push(view);
}

export function findView(id) {
  return moduleViews.find((v) => v.id === id);
}
