import { alignTo } from "./gltf_enums";

export class GLTFBuffer {
  buffer: Uint8Array;

  constructor(buffer: ArrayBuffer, offset: number, size: number) {
    this.buffer = new Uint8Array(buffer, offset, size);
  }
}

export class GLTFBufferView {
  byteLength: number;
  byteStride: number;
  view: Uint8Array;
  needsUpload: boolean;
  gpuBuffer: GPUBuffer;
  usage: GPUBufferUsageFlags;

  constructor(
    buffer: GLTFBuffer,
    byteLength: number,
    byteOffset: number,
    byteStride: number
  ) {
    this.byteLength = byteLength;
    this.byteStride = byteStride;
    // Create the buffer view. Note that subarray creates a new typed
    // view over the same array buffer, we do not make a copy here.
    this.view = buffer.buffer.subarray(
      byteOffset,
      byteOffset + this.byteLength
    );

    this.needsUpload = false;
    this.gpuBuffer = null;
    this.usage = 0;
  }

  addUsage(usage: GPUBufferUsageFlags) {
    this.usage = this.usage | usage;
  }

  upload(device: GPUDevice) {
    // Note: must align to 4 byte size when mapped at creation is true
    let buf = device.createBuffer({
      size: alignTo(this.view.byteLength, 4),
      usage: this.usage,
      mappedAtCreation: true,
    });
    new Uint8Array(buf.getMappedRange()).set(this.view);
    buf.unmap();
    this.gpuBuffer = buf;
    this.needsUpload = false;
  }
}
