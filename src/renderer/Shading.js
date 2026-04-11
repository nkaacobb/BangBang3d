import { Vector3 } from '../math/Vector3.js';
import { Color } from '../math/Color.js';

/**
 * Shading - CPU-based shading functions for lighting calculations
 */
export class Shading {
  /**
   * Calculate ambient lighting contribution
   */
  static ambient(materialColor, ambientLight) {
    const result = new Color();
    result.r = materialColor.r * ambientLight.color.r * ambientLight.intensity;
    result.g = materialColor.g * ambientLight.color.g * ambientLight.intensity;
    result.b = materialColor.b * ambientLight.color.b * ambientLight.intensity;
    return result;
  }

  /**
   * Calculate diffuse (Lambertian) lighting contribution
   * @param {Vector3} normal - Surface normal (normalized)
   * @param {Vector3} lightDir - Light direction (normalized, pointing TO light)
   * @param {Color} materialColor - Material diffuse color
   * @param {Light} light - Light source
   */
  static diffuse(normal, lightDir, materialColor, light) {
    // Lambert's cosine law: I = max(N · L, 0)
    const NdotL = Math.max(0, normal.dot(lightDir));

    const result = new Color();
    result.r = materialColor.r * light.color.r * light.intensity * NdotL;
    result.g = materialColor.g * light.color.g * light.intensity * NdotL;
    result.b = materialColor.b * light.color.b * light.intensity * NdotL;

    return result;
  }

  /**
   * Calculate full Lambert shading for a fragment
   * @param {Color} materialColor - Material base color
   * @param {Vector3} normal - Interpolated surface normal (world space)
   * @param {Array} lights - Array of scene lights
   */
  static lambert(materialColor, normal, lights, emissive = null, emissiveIntensity = 1.0) {
    const finalColor = new Color(0, 0, 0);

    // Add emissive
    if (emissive) {
      finalColor.r += emissive.r * emissiveIntensity;
      finalColor.g += emissive.g * emissiveIntensity;
      finalColor.b += emissive.b * emissiveIntensity;
    }

    // Normalize the normal
    const n = normal.clone().normalize();

    // Calculate lighting contribution from each light
    for (const light of lights) {
      if (!light.visible) continue;

      if (light.isAmbientLight) {
        const ambient = Shading.ambient(materialColor, light);
        finalColor.add(ambient);
      } else if (light.isDirectionalLight) {
        // Get light direction (pointing TO light)
        const lightDir = new Vector3();
        light.getDirection(lightDir);
        lightDir.negate(); // Flip to point toward light

        const diffuse = Shading.diffuse(n, lightDir, materialColor, light);
        finalColor.add(diffuse);
      }
      // TODO: Add PointLight, SpotLight in future milestones
    }

    // Clamp to [0, 1]
    finalColor.r = Math.min(1.0, Math.max(0.0, finalColor.r));
    finalColor.g = Math.min(1.0, Math.max(0.0, finalColor.g));
    finalColor.b = Math.min(1.0, Math.max(0.0, finalColor.b));

    return finalColor;
  }

  /**
   * Basic (unlit) shading - just return material color
   */
  static basic(materialColor) {
    return materialColor.clone();
  }
}
