import { GLTFAccessor } from "./gltf_accessor";
import { GLTFRenderMode } from "./gltf_enums";

export class GLTFPrimitive {
  positions: GLTFAccessor;
  indices: GLTFAccessor;
  topology: GLTFRenderMode;

  renderPipeline: GPURenderPipeline;

  constructor(
    positions: GLTFAccessor,
    indices: GLTFAccessor,
    topology: GLTFRenderMode
  ) {
    this.positions = positions;
    this.indices = indices;
    this.topology = topology;
    this.renderPipeline = null;

    this.positions.view.needsUpload = true;
    this.positions.view.addUsage(GPUBufferUsage.VERTEX);

    if (this.indices) {
      this.indices.view.needsUpload = true;
      this.indices.view.addUsage(GPUBufferUsage.INDEX);
    }
  }

  buildRenderPipeline(
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    colorFormat: GPUTextureFormat,
    depthFormat: GPUTextureFormat,
    bindGroupLayouts: Array<GPUBindGroupLayout>
  ) {
    // Vertex attribute state and shader stage
    let vertexState = {
      // Shader stage info
      module: shaderModule,
      entryPoint: "vertex_main",
      // Vertex buffer info
      buffers: [
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
              format: this.positions.elementType,
              offset: 0,
              shaderLocation: 0,
            },
          ],
        },
      ],
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
