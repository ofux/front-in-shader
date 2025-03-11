// Vertex shader program
const vsSource = `
    attribute vec4 aVertexPosition;
    void main() {
        gl_Position = aVertexPosition;
    }
`;

// Fragment shader program - 3D Terrain with Perlin Noise
const fsSource = `
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime;

    // Noise functions from Inigo Quilez
    vec3 hash(vec3 p) {
        p = vec3(dot(p,vec3(127.1,311.7, 74.7)),
                 dot(p,vec3(269.5,183.3,246.1)),
                 dot(p,vec3(113.5,271.9,124.6)));
        return -1.0 + 2.0*fract(sin(p)*43758.5453123);
    }

    float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f*f*(3.0-2.0*f);

        return mix(mix(mix(dot(hash(i + vec3(0.0,0.0,0.0)), f - vec3(0.0,0.0,0.0)),
                         dot(hash(i + vec3(1.0,0.0,0.0)), f - vec3(1.0,0.0,0.0)), u.x),
                     mix(dot(hash(i + vec3(0.0,1.0,0.0)), f - vec3(0.0,1.0,0.0)),
                         dot(hash(i + vec3(1.0,1.0,0.0)), f - vec3(1.0,1.0,0.0)), u.x), u.y),
                 mix(mix(dot(hash(i + vec3(0.0,0.0,1.0)), f - vec3(0.0,0.0,1.0)),
                         dot(hash(i + vec3(1.0,0.0,1.0)), f - vec3(1.0,0.0,1.0)), u.x),
                     mix(dot(hash(i + vec3(0.0,1.0,1.0)), f - vec3(0.0,1.0,1.0)),
                         dot(hash(i + vec3(1.0,1.0,1.0)), f - vec3(1.0,1.0,1.0)), u.x), u.y), u.z);
    }

    float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        for(int i = 0; i < 6; i++) {
            value += amplitude * noise(p * frequency);
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        return value;
    }

    vec3 calcNormal(vec3 p, float t) {
        vec2 e = vec2(0.01, 0.0);
        float h = fbm(p);
        vec3 n = vec3(
            fbm(p + vec3(e.x, 0.0, 0.0)) - h,
            e.x,
            fbm(p + vec3(0.0, 0.0, e.x)) - h
        );
        return normalize(n);
    }

    void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
        
        // Camera setup - Adjusted for better view
        vec3 ro = vec3(0.0, 4.0, -6.0); // Moved camera higher and further back
        vec3 lookAt = vec3(0.0, 0.0, 0.0); // Looking at the center
        vec3 forward = normalize(lookAt - ro);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
        vec3 up = cross(forward, right);
        vec3 rd = normalize(forward + right * uv.x + up * uv.y);
        
        // Rotate camera
        float angle = uTime * 0.2;
        mat3 rot = mat3(
            cos(angle), 0.0, -sin(angle),
            0.0, 1.0, 0.0,
            sin(angle), 0.0, cos(angle)
        );
        ro *= rot;
        rd *= rot;

        // Ray marching
        float t = 0.0;
        float tmax = 20.0;
        float h = 0.0;
        vec3 p;
        
        for(int i = 0; i < 128; i++) {
            p = ro + rd * t;
            h = p.y - fbm(p * 0.5) * 1.0;
            if(abs(h) < 0.01 || t > tmax) break;
            t += h * 0.5;
        }
        
        vec3 col;
        
        if(t < tmax) {
            // Calculate normal and lighting
            vec3 normal = calcNormal(p * 0.5, t);
            vec3 light = normalize(vec3(1.0, 1.0, -1.0));
            
            // Base color based on height
            vec3 baseColor = mix(
                vec3(0.2, 0.3, 0.1), // Valley color
                vec3(0.8, 0.8, 0.8), // Peak color
                smoothstep(-0.5, 1.0, p.y)
            );
            
            // Lighting calculation
            float diff = max(dot(normal, light), 0.0);
            float amb = 0.2;
            
            col = baseColor * (diff + amb);
            
            // Add fog
            col = mix(col, vec3(0.6, 0.7, 0.8), 1.0 - exp(-0.1 * t));
        } else {
            // Sky color
            col = vec3(0.6, 0.7, 0.8);
        }
        
        // Gamma correction
        col = pow(col, vec3(0.4545));
        
        gl_FragColor = vec4(col, 1.0);
    }
`;

let gl;
let programInfo;
let buffers;
let then = 0;

// Initialize WebGL
function main() {
    const canvas = document.querySelector('#glCanvas');
    gl = canvas.getContext('webgl');

    if (!gl) {
        alert('Unable to initialize WebGL. Your browser or machine may not support it.');
        return;
    }

    // Create shader program
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

    programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
        },
        uniformLocations: {
            resolution: gl.getUniformLocation(shaderProgram, 'uResolution'),
            time: gl.getUniformLocation(shaderProgram, 'uTime'),
        },
    };

    buffers = initBuffers(gl);

    // Handle canvas resize
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    requestAnimationFrame(render);
}

// Initialize buffers for a full-screen quad
function initBuffers(gl) {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const positions = [
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
         1.0,  1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    return {
        position: positionBuffer,
    };
}

// Initialize shader program
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    return shaderProgram;
}

// Create a shader of the given type, upload source and compile it
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

// Render function
function render(now) {
    now *= 0.001; // Convert to seconds
    const deltaTime = now - then;
    then = now;

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(programInfo.program);

    // Set uniforms
    gl.uniform2f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(programInfo.uniformLocations.time, now);

    // Set vertex attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(render);
}

// Start the application
window.onload = main; 