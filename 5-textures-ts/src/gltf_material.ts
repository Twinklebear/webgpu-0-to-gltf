import { vec3 } from "gl-matrix";
import { GLTFTexture, ImageUsage } from "./gltf_texture";

export class GLTFMaterial {
  baseColorFactor: vec3 = [1, 1, 1];
  baseColorTexture: GLTFTexture | null = null;

  // TODO later: multiple texture coords support

  metallicFactor: number = 0;
  roughnessFactor: number = 1;
  metallicRoughnessTexture: GLTFTexture | null = null;

  // TODO: normal, occlusion, emissive textures

  constructor(
    baseColorFactor: vec3,
    baseColorTexture: GLTFTexture | null,
    metallicFactor: number,
    roughnessFactor: number,
    metallicRoughnessTexture: GLTFTexture | null
  ) {
    this.baseColorFactor = baseColorFactor;
    this.baseColorTexture = baseColorTexture;
    if (this.baseColorTexture) {
      this.baseColorTexture.setUsage(ImageUsage.BASE_COLOR);
    }

    this.metallicFactor = metallicFactor;
    this.roughnessFactor = roughnessFactor;
    this.metallicRoughnessTexture = metallicRoughnessTexture;
    if (this.metallicRoughnessTexture) {
      this.metallicRoughnessTexture.setUsage(ImageUsage.METALLIC_ROUGHNESS);
    }
  }
}
