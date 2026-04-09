import type GUI from 'lil-gui';

/**
 * Adds a preset dropdown to the GUI that applies preset values to params and updates all controllers.
 */
export function addPresetControl<P extends { preset: string }>(
  gui: GUI,
  params: P,
  presets: Record<string, Partial<Omit<P, 'preset'>>>,
  applyParams: () => void,
  label: (key: string) => string,
): void {
  // Map translated display names to internal English keys for the dropdown
  const options: Record<string, string> = {};
  for (const key of Object.keys(presets)) {
    options[label(key)] = key;
  }
  gui.add(params, 'preset', options).name(label('Preset')).onChange((name: string) => {
    Object.assign(params, presets[name]);
    applyParams();
    gui.controllersRecursive().forEach(c => c.updateDisplay());
  });
}
