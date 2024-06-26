import { GLTFAccessor } from "./gltf_accessor";
import { GLTFRenderMode } from "./gltf_enums";
import { GLTFMaterial } from "./gltf_material";

export class GLTFPrimitive {
  material: GLTFMaterial;

  positions: GLTFAccessor;
  indices: GLTFAccessor;
  texcoords: GLTFAccessor;
  topology: GLTFRenderMode;

  renderPipeline: GPURenderPipeline;

  constructor(
    material: GLTFMaterial,
    positions: GLTFAccessor,
    indices: GLTFAccessor,
    texcoords: GLTFAccessor,
    topology: GLTFRenderMode
  ) {
    this.material = material;

    this.positions = positions;
    this.indices = indices;
    this.texcoords = texcoords;
    this.topology = topology;
    this.renderPipeline = null;

    this.positions.view.needsUpload = true;
    this.positions.view.addUsage(GPUBufferUsage.VERTEX);

    if (this.indices) {
      this.indices.view.needsUpload = true;
      this.indices.view.addUsage(GPUBufferUsage.INDEX);
    }

    if (this.texcoords) {
      this.texcoords.view.needsUpload = true;
      this.texcoords.view.addUsage(GPUBufferUsage.VERTEX);
    }
  }

  buildRenderPipeline(
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    colorFormat: GPUTextureFormat,
    depthFormat: GPUTextureFormat,
    bindGroupLayouts: Array<GPUBindGroupLayout>
  ) {
    let vertexBuffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: this.positions.byteStride,
        attributes: [
          // Note: We do not pass the positions.byteOffset here, as its
          // meaning can vary in different glB files, i.e., if it's being used
          // for an interleaved element offset or an absolute offset.
          //
          // Setting the offset here for the attribute requires it to be <= byteStride,
          // as would be the case for an interleaved vertex buffer.
          //
          // Offsets for interleaved elements can be passed here if we find
          // a single buffer is being referenced by multiple attributes and
          // the offsets fit within the byteStride. For simplicity we do not
          // detect this case right now, and just take each buffer independently
          // and apply the offst (per-element or absolute) in setVertexBuffer.
          {
            format: this.positions.elementType as GPUVertexFormat,
            offset: 0,
            shaderLocation: 0,
          },
        ],
      },
    ];
    if (this.texcoords) {
      vertexBuffers.push({
        arrayStride: this.texcoords.byteStride,
        attributes: [
          {
            format: this.texcoords.elementType as GPUVertexFormat,
            offset: 0,
            shaderLocation: 1,
          },
        ],
      });
    }
    console.log(vertexBuffers);

    // Vertex attribute state and shader stage
    let vertexState = {
      // Shader stage info
      module: shaderModule,
      entryPoint: "vertex_main",
      // Vertex buffer info
      buffers: vertexBuffers,
    };

    let fragmentState = {
      // Shader info
      module: shaderModule,
      entryPoint: "fragment_main",
      // Output render target info
      targets: [{ format: colorFormat }],
    };

    // Our loader only supports triangle lists and strips, so by default we set
    // the primitive topology to triangle list, and check if it's instead a triangle strip
    let primitive = null;
    if (this.topology == GLTFRenderMode.TRIANGLE_STRIP) {
      primitive = {
        topology: "triangle-strip",
        stripIndexFormat: this.indices.elementType as GPUIndexFormat,
      };
    } else {
      primitive = { topology: "triangle-list" };
    }

    // Add the material bind group layout
    bindGroupLayouts.push(this.material.bindGroupLayout);

    let layout = device.createPipelineLayout({
      bindGroupLayouts: bindGroupLayouts,
    });

    this.renderPipeline = device.createRenderPipeline({
      layout: layout,
      vertex: vertexState as GPUVertexState,
      fragment: fragmentState,
      primitive: primitive as GPUPrimitiveState,
      depthStencil: {
        format: depthFormat,
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });
  }

  render(renderPassEncoder: GPURenderPassEncoder) {
    renderPassEncoder.setPipeline(this.renderPipeline);

    renderPassEncoder.setBindGroup(2, this.material.bindGroup);

    // Apply the accessor's byteOffset here to handle both global and interleaved
    // offsets for the buffer. Setting the offset here allows handling both cases,
    // with the downside that we must repeatedly bind the same buffer at different
    // offsets if we're dealing with interleaved attributes.
    // Since we only handle positions at the moment, this isn't a problem.
    renderPassEncoder.setVertexBuffer(
      0,
      this.positions.view.gpuBuffer,
      this.positions.byteOffset,
      this.positions.byteLength
    );

    if (this.texcoords) {
      renderPassEncoder.setVertexBuffer(
        1,
        this.texcoords.view.gpuBuffer,
        this.texcoords.byteOffset,
        this.texcoords.byteLength
      );
    }

    if (this.indices) {
      renderPassEncoder.setIndexBuffer(
        this.indices.view.gpuBuffer,
        this.indices.elementType as GPUIndexFormat,
        this.indices.byteOffset,
        this.indices.byteLength
      );
      renderPassEncoder.drawIndexed(this.indices.count);
    } else {
      renderPassEncoder.draw(this.positions.count);
    }
  }
}
