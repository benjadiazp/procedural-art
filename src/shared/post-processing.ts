import * as THREE from 'three';
import {
  EffectComposer, EffectPass, RenderPass,
  BloomEffect, ChromaticAberrationEffect, VignetteEffect, NoiseEffect,
  BlendFunction,
} from 'postprocessing';

export interface PostProcessingParams {
  bloomStrength: number;
  bloomThreshold: number;
  /** Used as luminanceSmoothing for BloomEffect */
  bloomSmoothing: number;
  chromaticAberration: number;
  vignetteDarkness: number;
  noiseIntensity: number;
}

export interface PostProcessingResult {
  composer: EffectComposer;
  bloomEffect: BloomEffect;
  chromaticAberration: ChromaticAberrationEffect;
  vignetteEffect: VignetteEffect;
  noiseEffect: NoiseEffect;
  /** Push current param values to all effects */
  applyParams: (p: PostProcessingParams) => void;
}

export interface PostProcessingOptions {
  /**
   * If true, bloom gets its own EffectPass (separate from chromatic/vignette/noise).
   * Useful when you need to insert custom passes between bloom and the final effects.
   */
  separateBloom?: boolean;
  /** Called after the bloom pass is added, before the final effects pass. Use to insert custom passes. */
  afterBloom?: (composer: EffectComposer) => void;
  /** Vignette offset (default 0.3) */
  vignetteOffset?: number;
  /** ChromaticAberration modulationOffset (default 0.15) */
  chromaModulationOffset?: number;
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  params: PostProcessingParams,
  options: PostProcessingOptions = {},
): PostProcessingResult {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
  });
  composer.addPass(new RenderPass(scene, camera));

  const bloomEffect = new BloomEffect({
    intensity: params.bloomStrength,
    luminanceThreshold: params.bloomThreshold,
    luminanceSmoothing: params.bloomSmoothing,
    mipmapBlur: true,
  });

  const chromaticAberration = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(params.chromaticAberration, params.chromaticAberration),
    radialModulation: true,
    modulationOffset: options.chromaModulationOffset ?? 0.15,
  });

  const vignetteEffect = new VignetteEffect({
    darkness: params.vignetteDarkness,
    offset: options.vignetteOffset ?? 0.3,
  });

  const noiseEffect = new NoiseEffect({
    blendFunction: BlendFunction.OVERLAY,
  });
  noiseEffect.blendMode.opacity.value = params.noiseIntensity;

  if (options.separateBloom) {
    composer.addPass(new EffectPass(camera, bloomEffect));
    options.afterBloom?.(composer);
    composer.addPass(new EffectPass(camera, chromaticAberration, vignetteEffect, noiseEffect));
  } else {
    composer.addPass(new EffectPass(camera, bloomEffect, chromaticAberration, vignetteEffect, noiseEffect));
  }

  function applyParams(p: PostProcessingParams) {
    bloomEffect.intensity = p.bloomStrength;
    bloomEffect.luminanceMaterial.threshold = p.bloomThreshold;
    bloomEffect.luminanceMaterial.smoothing = p.bloomSmoothing;
    chromaticAberration.offset.set(p.chromaticAberration, p.chromaticAberration);
    vignetteEffect.darkness = p.vignetteDarkness;
    noiseEffect.blendMode.opacity.value = p.noiseIntensity;
  }

  return { composer, bloomEffect, chromaticAberration, vignetteEffect, noiseEffect, applyParams };
}
