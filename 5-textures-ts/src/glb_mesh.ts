import { mat4 } from "gl-matrix";
import { GLTFPrimitive } from "./gltf_primitive";

export class GLTFMesh {
  name: string;
  primitives: Array<GLTFPrimitive>;

  constructor(name: string, primitives: Array<GLTFPrimitive>) {
    this.name = name;
    this.primitives = primitives;
  }

  buildRenderPipeline(
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    colorFormat: GPUTextureFormat,
    depthFormat: GPUTextureFormat,
    bindGroupLayouts: Array<GPUBindGroupLayout>
  ) {
    // We take a pretty simple approach to start. Just loop through all the primitives and
    // build their respective render pipelines
    for (let prim of this.primitives) {
      prim.buildRenderPipeline(
        device,
        shaderModule,
        colorFormat,
        depthFormat,
        bindGroupLayouts
      );
    }
  }

  render(renderPassEncoder: GPURenderPassEncoder) {
    // We take a pretty simple approach to start. Just loop through all the primitives and
    // call their individual draw methods
    for (let prim of this.primitives) {
      prim.render(renderPassEncoder);
    }
  }
}

export class GLTFNode {
  name: string;
  transform: mat4;
  mesh: GLTFMesh;

  nodeParamsBuf: GPUBuffer;
  nodeParamsBGLayout: GPUBindGroupLayout;
  nodeParamsBG: GPUBindGroup;

  constructor(name: string, transform: mat4, mesh: GLTFMesh) {
    this.name = name;
    this.transform = transform;
    this.mesh = mesh;

    this.nodeParamsBuf = null;
    this.nodeParamsBGLayout = null;
    this.nodeParamsBG = null;
  }

  buildRenderPipeline(
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    colorFormat: GPUTextureFormat,
    depthFormat: GPUTextureFormat,
    uniformsBGLayout: GPUBindGroupLayout
  ) {
    // Upload the node transform
    this.nodeParamsBuf = device.createBuffer({
      size: 16 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.nodeParamsBuf.getMappedRange()).set(this.transform);
    this.nodeParamsBuf.unmap();

    var bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });
    this.nodeParamsBG = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.nodeParamsBuf } }],
    });

    this.mesh.buildRenderPipeline(
      device,
      shaderModule,
      colorFormat,
      depthFormat,
      [uniformsBGLayout, bindGroupLayout]
    );
  }

  render(renderPassEncoder: GPURenderPassEncoder) {
    renderPassEncoder.setBindGroup(1, this.nodeParamsBG);
    this.mesh.render(renderPassEncoder);
  }
}

export class GLTFScene {
  nodes: Array<GLTFNode>;

  constructor(nodes: Array<GLTFNode>) {
    this.nodes = nodes;
  }

  buildRenderPipeline(
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    colorFormat: GPUTextureFormat,
    depthFormat: GPUTextureFormat,
    uniformsBGLayout: GPUBindGroupLayout
  ) {
    for (let n of this.nodes) {
      n.buildRenderPipeline(
        device,
        shaderModule,
        colorFormat,
        depthFormat,
        uniformsBGLayout
      );
    }
  }

  render(renderPassEncoder: GPURenderPassEncoder, uniformsBG: GPUBindGroup) {
    renderPassEncoder.setBindGroup(0, uniformsBG);
    for (let n of this.nodes) {
      n.render(renderPassEncoder);
    }
  }
}
