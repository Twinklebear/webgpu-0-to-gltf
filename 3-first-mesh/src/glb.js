const GLTFRenderMode = {
    POINTS: 0,
    LINE: 1,
    LINE_LOOP: 2,
    LINE_STRIP: 3,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
    // Note: fans are not supported in WebGPU, use should be
    // an error or converted into a list/strip
    TRIANGLE_FAN: 6,
};

const GLTFComponentType = {
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    INT: 5124,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
    DOUBLE: 5130,
};

function alignTo(val, align) {
    return Math.floor((val + align - 1) / align) * align;
}

function gltfTypeNumComponents(type) {
    switch (type) {
        case "SCALAR":
            return 1;
        case "VEC2":
            return 2;
        case "VEC3":
            return 3;
        case "VEC4":
            return 4;
        default:
            throw Error(`Unhandled glTF Type ${type}`);
    }
}

// Note: only returns non-normalized type names,
// so byte/ubyte = sint8/uint8, not snorm8/unorm8, same for ushort
function gltfTypeToWebGPU(componentType, type) {
    var typeStr = null;
    switch (componentType) {
        case GLTFComponentType.BYTE:
            typeStr = "sint8";
            break;
        case GLTFComponentType.UNSIGNED_BYTE:
            typeStr = "uint8";
            break;
        case GLTFComponentType.SHORT:
            typeStr = "sint16";
            break;
        case GLTFComponentType.UNSIGNED_SHORT:
            typeStr = "uint16";
            break;
        case GLTFComponentType.INT:
            typeStr = "int32";
            break;
        case GLTFComponentType.UNSIGNED_INT:
            typeStr = "uint32";
            break;
        case GLTFComponentType.FLOAT:
            typeStr = "float32";
            break;
        default:
            throw Error(`Unrecognized or unsupported glTF type ${componentType}`);
    }

    switch (gltfTypeNumComponents(type)) {
        case 1:
            return typeStr;
        case 2:
            return typeStr + "x2";
        case 3:
            return typeStr + "x3";
        case 4:
            return typeStr + "x4";
        default:
            throw Error(`Invalid number of components for gltfType: ${type}`);
    }
}

function gltfTypeSize(componentType, type) {
    var typeSize = 0;
    switch (componentType) {
        case GLTFComponentType.BYTE:
            typeSize = 1;
            break;
        case GLTFComponentType.UNSIGNED_BYTE:
            typeSize = 1;
            break;
        case GLTFComponentType.SHORT:
            typeSize = 2;
            break;
        case GLTFComponentType.UNSIGNED_SHORT:
            typeSize = 2;
            break;
        case GLTFComponentType.INT:
            typeSize = 4;
            break;
        case GLTFComponentType.UNSIGNED_INT:
            typeSize = 4;
            break;
        case GLTFComponentType.FLOAT:
            typeSize = 4;
            break;
        case GLTFComponentType.DOUBLE:
            typeSize = 4;
            break;
        default:
            throw Error("Unrecognized GLTF Component Type?");
    }
    return gltfTypeNumComponents(type) * typeSize;
}

export class GLTFBuffer {
    constructor(buffer, size, offset) {
        this.arrayBuffer = buffer;
        this.size = size;
        this.byteOffset = offset;
    }
}

export class GLTFBufferView {
    constructor(buffer, view) {
        this.length = view["byteLength"];
        this.byteOffset = buffer.byteOffset;
        if (view["byteOffset"] !== undefined) {
            this.byteOffset += view["byteOffset"];
        }
        this.byteStride = 0;
        if (view["byteStride"] !== undefined) {
            this.byteStride = view["byteStride"];
        }
        this.buffer = new Uint8Array(buffer.arrayBuffer, this.byteOffset, this.length);

        this.needsUpload = false;
        this.gpuBuffer = null;
        this.usage = 0;
    }

    addUsage(usage) {
        this.usage = this.usage | usage;
    }

    upload(device) {
        // Note: must align to 4 byte size when mapped at creation is true
        var buf = device.createBuffer({
            size: alignTo(this.buffer.byteLength, 4),
            usage: this.usage,
            mappedAtCreation: true
        });
        new (this.buffer.constructor)(buf.getMappedRange()).set(this.buffer);
        buf.unmap();
        this.gpuBuffer = buf;
        this.needsUpload = false;
    }
}

export class GLTFAccessor {
    constructor(view, accessor) {
        this.count = accessor["count"];
        this.componentType = accessor["componentType"];
        this.gltfType = accessor["type"];
        this.webGpuType = gltfTypeToWebGPU(this.componentType, this.gltfType);
        this.view = view;
        this.byteOffset = 0;
        if (accessor["byteOffset"] !== undefined) {
            this.byteOffset = accessor["byteOffset"];
        }
    }

    get byteStride() {
        var elementSize = gltfTypeSize(this.componentType, this.gltfType);
        return Math.max(elementSize, this.view.byteStride);
    }
}

export class GLTFPrimitive {
    constructor(indices, positions, topology) {
        this.indices = indices;
        this.positions = positions;
        this.topology = topology;
        this.renderPipeline = null;
    }

    buildRenderPipeline(device, shaderModule, colorFormat, depthFormat, uniformsBGLayout) {
        // Vertex attribute state and shader stage
        var vertexState = {
            // Shader stage info
            module: shaderModule,
            entryPoint: "vertex_main",
            // Vertex buffer info
            buffers: [{
                arrayStride: this.positions.byteStride,
                attributes: [
                    // We do not pass offset here, the offset here is relative to the start of
                    // each attribute element within the arrayStride byte element. This is
                    // useful for interleaved vertex buffers, which we do not have.
                    // We will set the offset in setVertexBuffer.
                    {format: this.positions.webGpuType, offset: 0, shaderLocation: 0},
                ]
            }]
        };

        var fragmentState = {
            // Shader info
            module: shaderModule,
            entryPoint: "fragment_main",
            // Output render target info
            targets: [{format: colorFormat}]
        };

        // Our loader only supports triangle lists and strips, so by default we set
        // the primitive topology to triangle list, and check if it's instead a triangle strip
        var primitive = {topology: "triangle-list"};
        if (this.topology == GLTFRenderMode.TRIANGLE_STRIP) {
            primitive.topology = "triangle-strip";
            primitive.stripIndexFormat = this.indices.webGpuType;
        }

        var layout = device.createPipelineLayout({bindGroupLayouts: [uniformsBGLayout]});

        this.renderPipeline = device.createRenderPipeline({
            layout: layout,
            vertex: vertexState,
            fragment: fragmentState,
            primitive: primitive,
            depthStencil: {format: depthFormat, depthWriteEnabled: true, depthCompare: "less"}
        });
    }

    render(renderPassEncoder, uniformsBG) {
        renderPassEncoder.setPipeline(this.renderPipeline);
        renderPassEncoder.setBindGroup(0, uniformsBG);

        renderPassEncoder.setVertexBuffer(0,
            this.positions.view.gpuBuffer,
            this.positions.byteOffset,
            this.positions.length);

        if (this.indices) {
            renderPassEncoder.setIndexBuffer(this.indices.view.gpuBuffer,
                this.indices.webGpuType,
                this.indices.byteOffset,
                this.indices.length);
            renderPassEncoder.drawIndexed(this.indices.count);
        } else {
            renderPassEncoder.draw(this.positions.count);
        }
    }
}

export class GLTFMesh {
    constructor(name, primitives) {
        this.name = name;
        this.primitives = primitives;
    }

    buildRenderPipeline(device, shaderModule, colorFormat, depthFormat, uniformsBGLayout) {
        // We take a pretty simple approach to start. Just loop through all the primitives and
        // build their respective render pipelines
        for (var i = 0; i < this.primitives.length; ++i) {
            this.primitives[i].buildRenderPipeline(device,
                shaderModule,
                colorFormat,
                depthFormat,
                uniformsBGLayout);
        }
    }

    render(renderPassEncoder, uniformsBG) {
        // We take a pretty simple approach to start. Just loop through all the primitives and
        // call their individual draw methods
        for (var i = 0; i < this.primitives.length; ++i) {
            this.primitives[i].render(renderPassEncoder, uniformsBG);
        }
    }
}

// Upload a GLB model and return it
export async function uploadGLB(buffer, device) {
    document.getElementById("loading-text").hidden = false;
    // glB has a JSON chunk and a binary chunk, potentially followed by
    // other chunks specifying extension specific data, which we ignore
    // since we don't support any extensions.
    // Read the glB header and the JSON chunk header together 
    // glB header:
    // - magic: u32 (expect: 0x46546C67)
    // - version: u32 (expect: 2)
    // - length: u32 (size of the entire file, in bytes)
    // JSON chunk header
    // - chunkLength: u32 (size of the chunk, in bytes)
    // - chunkType: u32 (expect: 0x4E4F534A for the JSON chunk)
    var header = new Uint32Array(buffer, 0, 5);
    if (header[0] != 0x46546C67) {
        throw Error("Provided file is not a glB file")
    }
    if (header[1] != 2) {
        throw Error("Provided file is glTF 2.0 file");
    }
    if (header[4] != 0x4E4F534A) {
        throw Error("Invalid glB: The first chunk of the glB file is not a JSON chunk!");
    }

    // Parse the JSON chunk of the glB file to a JSON object
    var jsonChunk =
        JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(buffer, 20, header[3])));

    // Read the binary chunk header
    // - chunkLength: u32 (size of the chunk, in bytes)
    // - chunkType: u32 (expect: 0x46546C67 for the binary chunk)
    var binaryHeader = new Uint32Array(buffer, 20 + header[3], 2);
    if (binaryHeader[1] != 0x004E4942) {
        throw Error("Invalid glB: The second chunk of the glB file is not a binary chunk!");
    }
    // Make a GLTFBuffer that is a view of the entire binary chunk's data,
    // we'll use this to create buffer views within the chunk for memory referenced
    // by objects in the glTF scene
    var binaryChunk = new GLTFBuffer(buffer, binaryHeader[0], 28 + header[3]);

    // Create GLTFBufferView objects for all the buffer views in the glTF file
    var bufferViews = [];
    for (var i = 0; i < jsonChunk.bufferViews.length; ++i) {
        bufferViews.push(new GLTFBufferView(binaryChunk, jsonChunk.bufferViews[i]));
    }

    console.log(`glTF file has ${jsonChunk.meshes.length} meshes`);
    // Load the first mesh
    var mesh = jsonChunk.meshes[0];
    var meshPrimitives = [];
    for (var i = 0; i < mesh.primitives.length; ++i) {
        var prim = mesh.primitives[i];
        var topology = prim["mode"];
        // Default is triangles if mode specified
        if (topology === undefined) {
            topology = GLTFRenderMode.TRIANGLES;
        }
        if (topology != GLTFRenderMode.TRIANGLES &&
            topology != GLTFRenderMode.TRIANGLE_STRIP) {
            throw Error(`Unsupported primitive mode ${prim["mode"]}`);
        }

        var indices = null;
        if (jsonChunk["accessors"][prim["indices"]] !== undefined) {
            var accessor = jsonChunk["accessors"][prim["indices"]];
            var viewID = accessor["bufferView"];
            bufferViews[viewID].needsUpload = true;
            bufferViews[viewID].addUsage(GPUBufferUsage.INDEX);
            indices = new GLTFAccessor(bufferViews[viewID], accessor);
        }

        var positions = null;
        for (var attr in prim["attributes"]) {
            var accessor = jsonChunk["accessors"][prim["attributes"][attr]];
            var viewID = accessor["bufferView"];
            bufferViews[viewID].needsUpload = true;
            bufferViews[viewID].addUsage(GPUBufferUsage.VERTEX);
            if (attr == "POSITION") {
                positions = new GLTFAccessor(bufferViews[viewID], accessor);
            }
        }

        meshPrimitives.push(new GLTFPrimitive(indices, positions, topology));
    }

    // Upload the different views used by mesh
    for (var i = 0; i < bufferViews.length; ++i) {
        if (bufferViews[i].needsUpload) {
            bufferViews[i].upload(device);
        }
    }
    document.getElementById("loading-text").hidden = true;

    console.log(`Mesh ${mesh["name"]} has ${meshPrimitives.length} primitives`);
    return new GLTFMesh(mesh["name"], meshPrimitives);
}
