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
  gui.add(params, 'preset', Object.keys(presets)).name(label('Preset')).onChange((name: string) => {
    Object.assign(params, presets[name]);
    applyParams();
    gui.controllersRecursive().forEach(c => c.updateDisplay());
  });
}
