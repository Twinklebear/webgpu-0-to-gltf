import { GLTFBufferView } from "./gltf_buffer";
import {
  GLTFTextureFilter,
  GLTFTextureWrap,
  gltfAddressMode,
  gltfTextureFilterMode,
} from "./gltf_enums";

// Defines how to sample an image
export class GLTFSampler {
  magFilter: GPUFilterMode = "linear";
  minFilter: GPUFilterMode = "linear";

  wrapU: GPUAddressMode = "repeat";
  wrapV: GPUAddressMode = "repeat";

  sampler: GPUSampler = null;

  constructor(
    magFilter: GLTFTextureFilter,
    minFilter: GLTFTextureFilter,
    wrapU: GLTFTextureWrap,
    wrapV: GLTFTextureWrap
  ) {
    this.magFilter = gltfTextureFilterMode(magFilter);
    this.minFilter = gltfTextureFilterMode(minFilter);

    this.wrapU = gltfAddressMode(wrapU);
    this.wrapV = gltfAddressMode(wrapV);
  }

  // Create the GPU sampler
  create(device: GPUDevice) {
    this.sampler = device.createSampler({
      magFilter: this.magFilter,
      minFilter: this.minFilter,
      addressModeU: this.wrapU,
      addressModeV: this.wrapV,
      mipmapFilter: "nearest",
    });
  }
}

export enum ImageUsage {
  BASE_COLOR,
  METALLIC_ROUGHNESS,
  NORMAL,
  OCCLUSION,
  EMISSION,
}

// Stores the image data texture for an image in the file
export class GLTFImage {
  bitmap: ImageBitmap;

  // How the texture is used in the materials
  // referencing it
  usage: ImageUsage = ImageUsage.BASE_COLOR;

  image: GPUTexture = null;
  view: GPUTextureView = null;

  constructor(bitmap: ImageBitmap) {
    this.bitmap = bitmap;
  }

  // Set the usage mode for the image
  setUsage(usage: ImageUsage) {
    this.usage = usage;
  }

  // Upload the image to the GPU and create the view
  upload(device: GPUDevice) {
    let format: GPUTextureFormat = "rgba8unorm-srgb";
    switch (this.usage) {
      case ImageUsage.BASE_COLOR:
        format = "rgba8unorm-srgb";
        break;
      case ImageUsage.METALLIC_ROUGHNESS:
        format = "rgba8unorm";
        break;
      case ImageUsage.NORMAL:
      case ImageUsage.OCCLUSION:
      case ImageUsage.EMISSION:
        throw new Error("Unhandled image format for now, TODO!");
    }

    const imgSize = [this.bitmap.width, this.bitmap.height, 1];
    this.image = device.createTexture({
      size: imgSize,
      format: format,
      // Note: the render attachment usage is required for copyExternalImageToTexture,
      // we aren't going to actually render to these images ourselves
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: this.bitmap },
      { texture: this.image },
      imgSize
    );

    this.view = this.image.createView();
  }
}

// Combines image data with a sampler to use for it
export class GLTFTexture {
  sampler: GLTFSampler;
  image: GLTFImage;

  constructor(sampler: GLTFSampler, image: GLTFImage) {
    this.sampler = sampler;
    this.image = image;
  }

  // Set the texture's image usage flag
  setUsage(usage: ImageUsage) {
    this.image.setUsage(usage);
  }
}
