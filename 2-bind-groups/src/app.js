// We use webpack to package our shaders as string resources that we can import
import shaderCode from "./triangle.wgsl";
import {mat4, vec3} from "gl-matrix";
import {ArcballCamera} from "arcball_camera";
import {Controller} from "ez_canvas_controller";

(async () => {
    if (navigator.gpu === undefined) {
        document.getElementById("webgpu-canvas").setAttribute("style", "display:none;");
        document.getElementById("no-webgpu").setAttribute("style", "display:block;");
        return;
    }

    // Get a GPU device to render with
    var adapter = await navigator.gpu.requestAdapter();
    var device = await adapter.requestDevice();

    // Get a context to display our rendered image on the canvas
    var canvas = document.getElementById("webgpu-canvas");
    var context = canvas.getContext("webgpu");

    // Setup shader modules
    var shaderModule = device.createShaderModule({code: shaderCode});
    var compilationInfo = await shaderModule.getCompilationInfo();
    if (compilationInfo.messages.length > 0) {
        var hadError = false;
        console.log("Shader compilation log:");
        for (var i = 0; i < compilationInfo.messages.length; ++i) {
            var msg = compilationInfo.messages[i];
            console.log(`${msg.lineNum}:${msg.linePos} - ${msg.message}`);
            hadError = hadError || msg.type == "error";
        }
        if (hadError) {
            console.log("Shader failed to compile");
            return;
        }
    }

    // Specify vertex data
    // Allocate room for the vertex data: 3 vertices, each with 2 float4's
    var dataBuf = device.createBuffer(
        {size: 3 * 2 * 4 * 4, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true});

    // Interleaved positions and colors
    new Float32Array(dataBuf.getMappedRange()).set([
        1, -1, 0, 1,  // position
        1, 0, 0, 1,  // color
        -1, -1, 0, 1,  // position
        0, 1, 0, 1,  // color
        0, 1, 0, 1,  // position
        0, 0, 1, 1,  // color
    ]);
    dataBuf.unmap();

    // Vertex attribute state and shader stage
    var vertexState = {
        // Shader stage info
        module: shaderModule,
        entryPoint: "vertex_main",
        // Vertex buffer info
        buffers: [{
            arrayStride: 2 * 4 * 4,
            attributes: [
                {format: "float32x4", offset: 0, shaderLocation: 0},
                {format: "float32x4", offset: 4 * 4, shaderLocation: 1}
            ]
        }]
    };

    // Setup render outputs
    var swapChainFormat = "bgra8unorm";
    context.configure(
        {device: device, format: swapChainFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT});

    var depthFormat = "depth24plus-stencil8";
    var depthTexture = device.createTexture({
        size: {width: canvas.width, height: canvas.height, depth: 1},
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    var fragmentState = {
        // Shader info
        module: shaderModule,
        entryPoint: "fragment_main",
        // Output render target info
        targets: [{format: swapChainFormat}]
    };

    // Create bind group layout
    var bindGroupLayout = device.createBindGroupLayout({
        entries: [{binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {type: "uniform"}}]
    });

    // Create render pipeline
    var layout = device.createPipelineLayout({bindGroupLayouts: [bindGroupLayout]});

    var renderPipeline = device.createRenderPipeline({
        layout: layout,
        vertex: vertexState,
        fragment: fragmentState,
        depthStencil: {format: depthFormat, depthWriteEnabled: true, depthCompare: "less"}
    });

    var renderPassDesc = {
        colorAttachments: [{
            view: undefined,
            loadOp: "clear",
            clearValue: [0.3, 0.3, 0.3, 1],
            storeOp: "store"
        }],
        depthStencilAttachment: {
            view: depthTexture.createView(),
            depthLoadOp: "clear",
            depthClearValue: 1.0,
            depthStoreOp: "store",
            stencilLoadOp: "clear",
            stencilClearValue: 0,
            stencilStoreOp: "store"
        }
    };

    // Create a buffer to store the view parameters
    var viewParamsBuffer = device.createBuffer(
        {size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});

    var viewParamBG = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{binding: 0, resource: {buffer: viewParamsBuffer}}]
    });

    var camera =
        new ArcballCamera([0, 0, 3], [0, 0, 0], [0, 1, 0], 0.5, [canvas.width, canvas.height]);
    var proj = mat4.perspective(
        mat4.create(), 50 * Math.PI / 180.0, canvas.width / canvas.height, 0.1, 100);
    var projView = mat4.create();

    // Register mouse and touch listeners
    var controller = new Controller();
    controller.mousemove = function (prev, cur, evt) {
        if (evt.buttons == 1) {
            camera.rotate(prev, cur);

        } else if (evt.buttons == 2) {
            camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
        }
    };
    controller.wheel = function (amt) {
        camera.zoom(amt);
    };
    controller.pinch = controller.wheel;
    controller.twoFingerDrag = function (drag) {
        camera.pan(drag);
    };
    controller.registerForCanvas(canvas);

    var animationFrame = function () {
        var resolve = null;
        var promise = new Promise(r => resolve = r);
        window.requestAnimationFrame(resolve);
        return promise
    };
    requestAnimationFrame(animationFrame);

    // Render!
    while (true) {
        await animationFrame();

        // Update camera buffer
        projView = mat4.mul(projView, proj, camera.camera);

        var upload = device.createBuffer(
            {size: 16 * 4, usage: GPUBufferUsage.COPY_SRC, mappedAtCreation: true});
        {
            var map = new Float32Array(upload.getMappedRange());
            map.set(projView);
            upload.unmap();
        }

        renderPassDesc.colorAttachments[0].view = context.getCurrentTexture().createView();

        var commandEncoder = device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(upload, 0, viewParamsBuffer, 0, 16 * 4);

        var renderPass = commandEncoder.beginRenderPass(renderPassDesc);

        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, viewParamBG);
        renderPass.setVertexBuffer(0, dataBuf);
        renderPass.draw(3, 1, 0, 0);

        renderPass.end();
        device.queue.submit([commandEncoder.finish()]);
    }
})();
