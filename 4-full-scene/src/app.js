// We use webpack to package our shaders as string resources that we can import
import {mat4} from "gl-matrix";
import {ArcballCamera} from "arcball_camera";
import {Controller} from "ez_canvas_controller";

import shaderCode from "./glb_prim.wgsl";
import twoCylinder from "./2CylinderEngine.glb";

import {uploadGLB} from "./glb";

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

    // Setup render outputs
    var swapChainFormat = "bgra8unorm";
    context.configure(
        {device: device, format: swapChainFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT});

    var depthFormat = "depth24plus-stencil8";
    var depthTexture = device.createTexture({
        size: {width: canvas.width, height: canvas.height, depthOrArrayLayers: 1},
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    // Create bind group layout
    var bindGroupLayout = device.createBindGroupLayout({
        entries: [{binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {type: "uniform"}}]
    });

    // Create a buffer to store the view parameters
    var viewParamsBuffer = device.createBuffer(
        {size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});

    var viewParamBG = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{binding: 0, resource: {buffer: viewParamsBuffer}}]
    });

    // Load the packaged GLB file, 2CylinderEngine.glb
    var scene = await fetch(twoCylinder)
        .then(res => res.arrayBuffer()).then(buf => uploadGLB(buf, device));

    scene.buildRenderPipeline(device,
        shaderModule,
        swapChainFormat,
        depthFormat,
        bindGroupLayout);

    console.log(scene);

    // Setup onchange listener for file uploads
    document.getElementById("uploadGLB").onchange =
        function () {
            document.getElementById("loading-text").hidden = false;
            var reader = new FileReader();
            reader.onerror = function () {
                throw Error("Error reading GLB file");
            };
            reader.onload = function () {
                scene = uploadGLB(reader.result, device)
                scene.buildRenderPipeline(device,
                    shaderModule,
                    swapChainFormat,
                    depthFormat,
                    bindGroupLayout);
                console.log(scene);
            };
            if (this.files[0]) {
                reader.readAsArrayBuffer(this.files[0]);
            }
        };

    // Setup the camera
    // Pick a far view for the 2CylinderEngine that shows the whole scene
    var camera =
        new ArcballCamera([0, 0, 700], [0, 0, 0], [0, 1, 0], 0.5, [canvas.width, canvas.height]);
    var proj = mat4.perspective(
        mat4.create(), 50 * Math.PI / 180.0, canvas.width / canvas.height, 0.01, 1000);
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

    // Render!
    const render = () => {
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

        scene.render(renderPass, viewParamBG);

        renderPass.end();
        device.queue.submit([commandEncoder.finish()]);
        upload.destroy();
        requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
})();
