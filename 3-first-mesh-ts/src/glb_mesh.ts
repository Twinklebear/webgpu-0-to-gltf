enum GLTFRenderMode
{
    POINTS = 0,
    LINE = 1,
    LINE_LOOP = 2,
    LINE_STRIP = 3,
    TRIANGLES = 4,
    TRIANGLE_STRIP = 5,
    // Note: fans are not supported in WebGPU, use should be
    // an error or converted into a list/strip
    TRIANGLE_FAN = 6,
};

enum GLTFComponentType
{
    BYTE = 5120,
    UNSIGNED_BYTE = 5121,
    SHORT = 5122,
    UNSIGNED_SHORT = 5123,
    INT = 5124,
    UNSIGNED_INT = 5125,
    FLOAT = 5126,
    DOUBLE = 5130,
};

enum GLTFType
{
    SCALAR = 0,
    VEC2 = 1,
    VEC3 = 2,
    VEC4 = 3,
    MAT2 = 4,
    MAT3 = 5,
    MAT4 = 6

};

function alignTo(val: number, align: number)
{
    return Math.floor((val + align - 1) / align) * align;
}

function parseGltfType(type: string)
{
    switch (type) {
        case "SCALAR":
            return GLTFType.SCALAR;
        case "VEC2":
            return GLTFType.VEC2;
        case "VEC3":
            return GLTFType.VEC3;
        case "VEC4":
            return GLTFType.VEC4;
        case "MAT2":
            return GLTFType.MAT2;
        case "MAT3":
            return GLTFType.MAT3;
        case "MAT4":
            return GLTFType.MAT4;
        default:
            throw Error(`Unhandled glTF Type ${type}`);
    }
}

function gltfTypeNumComponents(type: GLTFType)
{
    switch (type) {
        case GLTFType.SCALAR:
            return 1;
        case GLTFType.VEC2:
            return 2;
        case GLTFType.VEC3:
            return 3;
        case GLTFType.VEC4:
        case GLTFType.MAT2:
            return 4;
        case GLTFType.MAT3:
            return 9;
        case GLTFType.MAT4:
            return 16;
        default:
            throw Error(`Invalid glTF Type ${type}`);
    }
}

// Note: only returns non-normalized type names,
// so byte/ubyte = sint8/uint8, not snorm8/unorm8, same for ushort
function gltfVertexType(componentType: GLTFComponentType, type: GLTFType)
{
    let typeStr = null;
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

function gltfTypeSize(componentType: GLTFComponentType, type: GLTFType)
{
    let componentSize = 0;
    switch (componentType) {
        case GLTFComponentType.BYTE:
            componentSize = 1;
            break;
        case GLTFComponentType.UNSIGNED_BYTE:
            componentSize = 1;
            break;
        case GLTFComponentType.SHORT:
            componentSize = 2;
            break;
        case GLTFComponentType.UNSIGNED_SHORT:
            componentSize = 2;
            break;
        case GLTFComponentType.INT:
            componentSize = 4;
            break;
        case GLTFComponentType.UNSIGNED_INT:
            componentSize = 4;
            break;
        case GLTFComponentType.FLOAT:
            componentSize = 4;
            break;
        case GLTFComponentType.DOUBLE:
            componentSize = 8;
            break;
        default:
            throw Error("Unrecognized GLTF Component Type?");
    }
    return gltfTypeNumComponents(type) * componentSize;
}

export class GLTFBuffer
{
    buffer: Uint8Array;

    constructor(buffer: ArrayBuffer, offset: number, size: number)
    {
        this.buffer = new Uint8Array(buffer, offset, size);
    }
}

export class GLTFBufferView
{
    byteLength: number;
    byteStride: number;
    view: Uint8Array;
    needsUpload: boolean;
    gpuBuffer: GPUBuffer;
    usage: GPUBufferUsageFlags;

    constructor(buffer: GLTFBuffer, byteLength: number, byteOffset: number, byteStride: number)
    {
        this.byteLength = byteLength;
        this.byteStride = byteStride;
        // Create the buffer view. Note that subarray creates a new typed
        // view over the same array buffer, we do not make a copy here.
        this.view = buffer.buffer.subarray(byteOffset, byteOffset + this.byteLength);

        this.needsUpload = false;
        this.gpuBuffer = null;
        this.usage = 0;
    }

    addUsage(usage: GPUBufferUsageFlags)
    {
        this.usage = this.usage | usage;
    }

    upload(device: GPUDevice)
    {
        // Note: must align to 4 byte size when mapped at creation is true
        let buf = device.createBuffer({
            size: alignTo(this.view.byteLength, 4),
            usage: this.usage,
            mappedAtCreation: true
        });
        new Uint8Array(buf.getMappedRange()).set(this.view);
        buf.unmap();
        this.gpuBuffer = buf;
        this.needsUpload = false;
    }
}

export class GLTFAccessor
{
    count: number;
    componentType: GLTFComponentType;
    gltfType: GLTFType;
    view: GLTFBufferView;
    byteOffset: number;

    constructor(view: GLTFBufferView, count: number, componentType: GLTFComponentType,
        gltfType: GLTFType, byteOffset: number)
    {
        this.count = count;
        this.componentType = componentType;
        this.gltfType = gltfType;
        this.view = view;
        this.byteOffset = byteOffset;
    }

    get byteStride()
    {
        let elementSize = gltfTypeSize(this.componentType, this.gltfType);
        return Math.max(elementSize, this.view.byteStride);
    }

    get byteLength()
    {
        return this.count * this.byteStride;
    }

    // Get the vertex attribute type for accessors that are used as vertex attributes
    get elementType()
    {
        return gltfVertexType(this.componentType, this.gltfType);
    }
}

export class GLTFPrimitive
{
    positions: GLTFAccessor;
    indices: GLTFAccessor;
    topology: GLTFRenderMode;

    renderPipeline: GPURenderPipeline;

    constructor(positions: GLTFAccessor, indices: GLTFAccessor, topology: GLTFRenderMode)
    {
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

    buildRenderPipeline(device: GPUDevice, shaderModule: GPUShaderModule, colorFormat: GPUTextureFormat, depthFormat: GPUTextureFormat, uniformsBGLayout: GPUBindGroupLayout)
    {
        // Vertex attribute state and shader stage
        let vertexState = {
            // Shader stage info
            module: shaderModule,
            entryPoint: "vertex_main",
            // Vertex buffer info
            buffers: [{
                arrayStride: this.positions.byteStride,
                attributes: [
                    // Note: We do not pass the positions.byteOffset here, as its
                    // meaning can lety in different glB files, i.e., if it's being used
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
                        shaderLocation: 0
                    }
                ]
            }]
        };

        let fragmentState = {
            // Shader info
            module: shaderModule,
            entryPoint: "fragment_main",
            // Output render target info
            targets: [{format: colorFormat}]
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
            primitive = {topology: "triangle-list"};
        }

        let layout = device.createPipelineLayout({bindGroupLayouts: [uniformsBGLayout]});

        this.renderPipeline = device.createRenderPipeline({
            layout: layout,
            vertex: vertexState as GPUVertexState,
            fragment: fragmentState,
            primitive: primitive as GPUPrimitiveState,
            depthStencil: {format: depthFormat, depthWriteEnabled: true, depthCompare: "less"}
        });
    }

    render(renderPassEncoder: GPURenderPassEncoder, uniformsBG: GPUBindGroup)
    {
        renderPassEncoder.setPipeline(this.renderPipeline);
        renderPassEncoder.setBindGroup(0, uniformsBG);

        // Apply the accessor's byteOffset here to handle both global and interleaved
        // offsets for the buffer. Setting the offset here allows handling both cases,
        // with the downside that we must repeatedly bind the same buffer at different
        // offsets if we're dealing with interleaved attributes.
        // Since we only handle positions at the moment, this isn't a problem.
        renderPassEncoder.setVertexBuffer(0,
            this.positions.view.gpuBuffer,
            this.positions.byteOffset,
            this.positions.byteLength);

        if (this.indices) {
            renderPassEncoder.setIndexBuffer(this.indices.view.gpuBuffer,
                this.indices.elementType as GPUIndexFormat,
                this.indices.byteOffset,
                this.indices.byteLength);
            renderPassEncoder.drawIndexed(this.indices.count);
        } else {
            renderPassEncoder.draw(this.positions.count);
        }
    }
}

export class GLTFMesh
{
    name: string;
    primitives: Array<GLTFPrimitive>;

    constructor(name: string, primitives: Array<GLTFPrimitive>)
    {
        this.name = name;
        this.primitives = primitives;
    }

    buildRenderPipeline(device: GPUDevice, shaderModule: GPUShaderModule, colorFormat: GPUTextureFormat, depthFormat: GPUTextureFormat, uniformsBGLayout: GPUBindGroupLayout)
    {
        // We take a pretty simple approach to start. Just loop through all the primitives and
        // build their respective render pipelines
        for (let prim of this.primitives) {
            prim.buildRenderPipeline(device,
                shaderModule,
                colorFormat,
                depthFormat,
                uniformsBGLayout);
        }
    }

    render(renderPassEncoder: GPURenderPassEncoder, uniformsBG: GPUBindGroup)
    {
        // We take a pretty simple approach to start. Just loop through all the primitives and
        // call their individual draw methods
        for (let prim of this.primitives) {
            prim.render(renderPassEncoder, uniformsBG);
        }
    }
}

// Upload a GLB model and return it
export function uploadGLB(buffer: ArrayBuffer, device: GPUDevice)
{
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
    let header = new Uint32Array(buffer, 0, 5);
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
    let jsonChunk =
        JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(buffer, 20, header[3])));

    // Read the binary chunk header
    // - chunkLength: u32 (size of the chunk, in bytes)
    // - chunkType: u32 (expect: 0x46546C67 for the binary chunk)
    let binaryHeader = new Uint32Array(buffer, 20 + header[3], 2);
    if (binaryHeader[1] != 0x004E4942) {
        throw Error("Invalid glB: The second chunk of the glB file is not a binary chunk!");
    }
    // Make a GLTFBuffer that is a view of the entire binary chunk's data,
    // we'll use this to create buffer views within the chunk for memory referenced
    // by objects in the glTF scene
    let binaryChunk = new GLTFBuffer(buffer, 28 + header[3], binaryHeader[0]);

    // Create GLTFBufferView objects for all the buffer views in the glTF file
    let bufferViews = [];
    for (let bv of jsonChunk.bufferViews) {
        let byteLength = bv["byteLength"] as number;
        let byteStride = 0;
        if ("byteStride" in bv) {
            byteStride = bv["byteStride"] as number;
        }
        let byteOffset = 0;
        if ("byteOffset" in bv) {
            byteOffset = bv["byteOffset"] as number;
        }
        bufferViews.push(new GLTFBufferView(binaryChunk, byteLength, byteOffset, byteStride));
    }

    // Create GLTFAccessor objects for the accessors in the glTF file
    // We need to handle possible errors being thrown here if a model is using
    // accessors for types we don't support yet. For example, a model with animation
    // may have a MAT4 accessor, which we currently don't support.
    let accessors = [];
    for (let ac of jsonChunk.accessors) {
        let viewID = ac["bufferView"];
        let count = ac["count"] as number;
        let componentType = ac["componentType"] as GLTFComponentType;
        let gltfType = parseGltfType(ac["type"]);
        let byteOffset = 0;
        if ("byteOffset" in ac) {
            byteOffset = ac["byteOffset"] as number;
        }
        // Now parse the json data out of accessorInfo
        accessors.push(new GLTFAccessor(bufferViews[viewID], count, componentType, gltfType, byteOffset));
    }

    console.log(`glTF file has ${jsonChunk.meshes.length} meshes`);
    // Load the first mesh
    let mesh = jsonChunk.meshes[0];
    let meshPrimitives = [];
    for (let prim of mesh.primitives) {
        let topology = prim["mode"];
        // Default is triangles if mode specified
        if (topology === undefined) {
            topology = GLTFRenderMode.TRIANGLES;
        }
        if (topology != GLTFRenderMode.TRIANGLES &&
            topology != GLTFRenderMode.TRIANGLE_STRIP) {
            throw Error(`Unsupported primitive mode ${prim["mode"]}`);
        }

        let indices = null;
        if (jsonChunk["accessors"][prim["indices"]] !== undefined) {
            indices = accessors[prim["indices"]];
        }

        // Loop through all the attributes to find the POSITION attribute.
        // While we only want the position attribute right now, we'll load
        // the others later as well.
        let positions = null;
        for (let attr in prim["attributes"]) {
            let accessor = accessors[prim["attributes"][attr]];
            if (attr == "POSITION") {
                positions = accessor;
            }
        }

        // Add the primitive to the mesh's list of primitives
        meshPrimitives.push(new GLTFPrimitive(positions, indices, topology));
    }

    // Upload the buffer views used by mesh
    for (let bv of bufferViews) {
        if (bv.needsUpload) {
            bv.upload(device);
        }
    }
    document.getElementById("loading-text").hidden = true;

    console.log(`Mesh ${mesh["name"]} has ${meshPrimitives.length} primitives`);
    return new GLTFMesh(mesh["name"], meshPrimitives);
}

