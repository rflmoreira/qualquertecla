/**
 * Liquid Distortion WebGL — tipografia do massive brand.
 * Carregado sob demanda por main.js; inicialização via LiquidDistortion.boot().
 */
(function (global) {
    const LIQUID_DEBUG = false;

    function liquidDebug(...args) {
        if (LIQUID_DEBUG) console.debug('[Liquid]', ...args);
    }

    /** Preflight mínimo: apenas verifica se um contexto WebGL pode ser criado. */
    function canUseLiquidWebGL() {
        try {
            const canvas = document.createElement('canvas');
            const gl =
                canvas.getContext('webgl2') ||
                canvas.getContext('webgl') ||
                canvas.getContext('experimental-webgl');
            if (!gl) {
                return { ok: false, reason: 'webgl-unavailable' };
            }
            return { ok: true };
        } catch (_) {
            return { ok: false, reason: 'webgl-unavailable' };
        }
    }

    /** Valida compilação/link dos shaders reais — falha somente em COMPILE/LINK explícitos. */
    function validateRealShaders(renderer, material) {
        if (!renderer || !material) {
            return { ok: false, reason: 'shader-failed' };
        }
        const gl = renderer.getContext();
        if (!gl) {
            return { ok: false, reason: 'shader-failed' };
        }
        const webglProgram = material.program;
        if (!webglProgram) {
            liquidDebug('shader validation: program not exposed after render — allowing WebGL');
            return { ok: true };
        }
        const vs = webglProgram.vertexShader;
        const fs = webglProgram.fragmentShader;
        const prog = webglProgram.program;
        if (!vs || !fs || !prog) {
            liquidDebug('shader validation: incomplete program handle — allowing WebGL');
            return { ok: true };
        }
        if (gl.getShaderParameter(vs, gl.COMPILE_STATUS) === false) {
            console.warn('[LiquidDistortion] Vertex shader:', gl.getShaderInfoLog(vs));
            return { ok: false, reason: 'shader-failed' };
        }
        if (gl.getShaderParameter(fs, gl.COMPILE_STATUS) === false) {
            console.warn('[LiquidDistortion] Fragment shader:', gl.getShaderInfoLog(fs));
            return { ok: false, reason: 'shader-failed' };
        }
        if (gl.getProgramParameter(prog, gl.LINK_STATUS) === false) {
            console.warn('[LiquidDistortion] Program link:', gl.getProgramInfoLog(prog));
            return { ok: false, reason: 'shader-failed' };
        }
        return { ok: true };
    }

    /**
     * Diagnóstico não bloqueante do framebuffer (nunca impede animate).
     */
    function probeFramebufferReadable(renderer) {
        try {
            const gl = renderer && renderer.getContext();
            const canvas = renderer && renderer.domElement;
            if (!gl || !canvas || canvas.width < 1 || canvas.height < 1) {
                return;
            }
            const pixels = new Uint8Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            liquidDebug('framebuffer probe:', pixels[0], pixels[1], pixels[2], pixels[3]);
        } catch (err) {
            liquidDebug('framebuffer probe failed:', err);
        }
    }

    function startLiquidInstance(container, instance) {
        delete container.dataset.liquidBooting;
        container.dataset.liquidInit = '1';
        container.__liquidInstance = instance;
        instance.bindEvents();
        if (typeof instance._syncActive === 'function') {
            instance._syncActive();
        } else {
            instance.active = true;
            instance.animate();
        }
        liquidDebug('WebGL initialized, animation started');
        return instance;
    }

    class LiquidDistortion {
        constructor(containerElement) {
            this.container = containerElement;
            this.text = String(
                this.container.dataset.text ||
                    (global.SiteLayout && typeof global.SiteLayout.brandLockupTextMassive === 'function'
                        ? global.SiteLayout.brandLockupTextMassive()
                        : global.SiteLayout && typeof global.SiteLayout.brandLockupText === 'function'
                          ? String(global.SiteLayout.brandLockupText()).toLocaleUpperCase('pt-BR')
                          : 'QUALQUER TECLA')
            );
            this.width = this.container.clientWidth;
            this.height =
                this.container.clientHeight || Math.min(window.innerHeight * 0.4, 400);
            this.gridSize = 32;
            this.relaxation = 0.94;
            this.mouseRadius = 0.15;
            this.forceMultiplier = 250.0;
            this.mouse = { x: 0, y: 0, prevX: 0, prevY: 0, vX: 0, vY: 0 };
            this.isHovering = false;
            this.rafId = null;
            this.active = false;
            this.destroyed = false;
            this._eventCleanups = [];
            this._onContextLost = null;
            this._pageVisible = true;
            this._inView = true;
            this._forcedPause = false;

            if (!global.THREE) {
                this.setupFailed = true;
                return;
            }

            this.setupFailed = !this.setup();
        }

        setup() {
            try {
                this.scene = new THREE.Scene();
                this.camera = new THREE.OrthographicCamera(
                    this.width / -2,
                    this.width / 2,
                    this.height / 2,
                    this.height / -2,
                    0.1,
                    10
                );
                this.camera.position.z = 1;

                this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
                this.renderer.setSize(this.width, this.height);
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                this.container.querySelectorAll('canvas').forEach((el) => el.remove());
                this.container.appendChild(this.renderer.domElement);

                this.textTexture = this.createTextTexture();

                const dataSize = this.gridSize * this.gridSize * 4;
                this.fluidData = new Float32Array(dataSize);
                this.dataTexture = new THREE.DataTexture(
                    this.fluidData,
                    this.gridSize,
                    this.gridSize,
                    THREE.RGBAFormat,
                    THREE.FloatType
                );
                this.dataTexture.needsUpdate = true;

                this.material = new THREE.ShaderMaterial({
                    uniforms: {
                        uTexture: { value: this.textTexture },
                        uDataTexture: { value: this.dataTexture },
                        time: { value: 0 }
                    },
                    vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
                    fragmentShader: `
                uniform sampler2D uTexture;
                uniform sampler2D uDataTexture;
                varying vec2 vUv;
                void main() {
                    vec2 uv = vUv;
                    vec4 offset = texture2D(uDataTexture, vUv);
                    vec2 displacedUv = uv - 0.015 * offset.rg;
                    vec4 color = texture2D(uTexture, displacedUv);
                    gl_FragColor = color;
                }
            `,
                    transparent: true
                });

                const geometry = new THREE.PlaneGeometry(this.width, this.height);
                this.plane = new THREE.Mesh(geometry, this.material);
                this.scene.add(this.plane);

                this.renderer.render(this.scene, this.camera);
                return true;
            } catch (err) {
                console.warn('[LiquidDistortion] Setup falhou:', err);
                return false;
            }
        }

        renderFrame() {
            if (!this.renderer || !this.material) return;
            this.updateFluid();
            this.material.uniforms.time.value += 0.05;
            this.renderer.render(this.scene, this.camera);
        }

        createTextTexture() {
            const canvas = document.createElement('canvas');
            const dpr = 2;
            canvas.width = Math.max(2, Math.floor(this.width * dpr));
            canvas.height = Math.max(2, Math.floor(this.height * dpr));
            const ctx = canvas.getContext('2d');
            const computedStyle = window.getComputedStyle(this.container);
            const fontFamily =
                computedStyle.fontFamily ||
                '"Genos", "Bricolage Grotesque", system-ui, sans-serif';
            const rawWeight = computedStyle.fontWeight || '700';
            const fontWeight = rawWeight === 'bold' || Number(rawWeight) >= 700 ? '700' : rawWeight;
            const letterSpacing = computedStyle.letterSpacing || 'normal';
            const wordSpacing = computedStyle.wordSpacing || '0px';
            const cssFontSize = parseFloat(computedStyle.fontSize) || 1;
            const letterEm =
                letterSpacing === 'normal' ? 0 : (parseFloat(letterSpacing) || 0) / cssFontSize;
            const wordEm =
                wordSpacing === 'normal' ? 0 : (parseFloat(wordSpacing) || 0) / cssFontSize;

            const insetX = Math.max(2, canvas.width * 0.012);
            const insetY = canvas.height * 0.04;
            const usableW = Math.max(2, canvas.width - insetX * 2);
            const usableH = Math.max(2, canvas.height - insetY * 2);
            const widthFill = 0.97;

            const applyFont = (size) => {
                ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
                /* Espaçamento manual — evita kerning nativo no par LA */
                if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '0px';
                if (typeof ctx.wordSpacing !== 'undefined') ctx.wordSpacing = '0px';
            };

            const laExtraFor = (size) => size * 0.05;

            const measureSpacedWidth = (size) => {
                applyFont(size);
                const chars = [...this.text];
                const ls = size * letterEm;
                const ws = size * wordEm;
                const la = laExtraFor(size);
                let w = 0;
                for (let i = 0; i < chars.length; i++) {
                    const ch = chars[i];
                    w += ctx.measureText(ch).width;
                    if (i < chars.length - 1) {
                        w += ch === ' ' ? ws : ls;
                        if (ch === 'L' && chars[i + 1] === 'A') w += la;
                    }
                }
                return w;
            };

            const measure = (size) => {
                applyFont(size);
                const sample = ctx.measureText('Hg');
                const ascent = sample.actualBoundingBoxAscent || size * 0.8;
                const descent = sample.actualBoundingBoxDescent || size * 0.2;
                const strokeW = Math.max(1, size * 0.01);
                return {
                    width: measureSpacedWidth(size),
                    height: ascent + descent + strokeW,
                    ascent: ascent + strokeW * 0.5,
                    descent: descent + strokeW * 0.5,
                    strokeW
                };
            };

            let fontSize = usableW * 0.12;
            let fit = measure(fontSize);
            if (fit.width > 0) {
                fontSize *= (usableW * widthFill) / fit.width;
                fit = measure(fontSize);
            }
            if (fit.height > usableH) {
                fontSize *= usableH / fit.height;
                fit = measure(fontSize);
            }

            const baselineY = insetY + (usableH - (fit.ascent + fit.descent)) / 2 + fit.ascent;
            const textX = (canvas.width - fit.width) / 2;
            const letterPx = fontSize * letterEm;
            const wordPx = fontSize * wordEm;
            const laExtra = laExtraFor(fontSize);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#0c0c0c';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            applyFont(fontSize);
            ctx.lineWidth = fit.strokeW;
            ctx.strokeStyle = '#0c0c0c';
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;

            let cursor = textX;
            const chars = [...this.text];
            for (let i = 0; i < chars.length; i++) {
                const ch = chars[i];
                ctx.strokeText(ch, cursor, baselineY);
                ctx.fillText(ch, cursor, baselineY);
                cursor += ctx.measureText(ch).width;
                if (i < chars.length - 1) {
                    cursor += ch === ' ' ? wordPx : letterPx;
                    if (ch === 'L' && chars[i + 1] === 'A') cursor += laExtra;
                }
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            return texture;
        }

        _addListener(target, type, handler, options) {
            target.addEventListener(type, handler, options);
            this._eventCleanups.push(() => target.removeEventListener(type, handler, options));
        }

        bindEvents() {
            if (!this.renderer) return;
            const surface =
                this.container.closest('.massive-brand-wrapper') || this.container;

            const updateFromClient = (clientX, clientY) => {
                const rect = this.renderer.domElement.getBoundingClientRect();
                const w = Math.max(rect.width, 1);
                const h = Math.max(rect.height, 1);
                const x = (clientX - rect.left) / w;
                const y = 1.0 - (clientY - rect.top) / h;
                this.mouse.vX = x - this.mouse.prevX;
                this.mouse.vY = y - this.mouse.prevY;
                this.mouse.x = x;
                this.mouse.y = y;
                this.mouse.prevX = x;
                this.mouse.prevY = y;
            };

            const seedFromClient = (clientX, clientY) => {
                const rect = this.renderer.domElement.getBoundingClientRect();
                const w = Math.max(rect.width, 1);
                const h = Math.max(rect.height, 1);
                const x = (clientX - rect.left) / w;
                const y = 1.0 - (clientY - rect.top) / h;
                this.mouse.x = x;
                this.mouse.y = y;
                this.mouse.prevX = x;
                this.mouse.prevY = y;
                this.mouse.vX = 0;
                this.mouse.vY = 0;
            };

            const blockDefault = (e) => e.preventDefault();
            this._addListener(surface, 'selectstart', blockDefault);
            this._addListener(surface, 'dragstart', blockDefault);
            this._addListener(surface, 'contextmenu', blockDefault);

            this._addListener(this.container, 'mousemove', (e) => {
                this.isHovering = true;
                updateFromClient(e.clientX, e.clientY);
            });

            this._addListener(this.container, 'mouseleave', () => {
                this.isHovering = false;
                this.mouse.vX = 0;
                this.mouse.vY = 0;
            });

            this._addListener(
                surface,
                'touchstart',
                (e) => {
                    if (!e.touches.length) return;
                    this.isHovering = true;
                    seedFromClient(e.touches[0].clientX, e.touches[0].clientY);
                },
                { passive: true }
            );

            this._addListener(
                surface,
                'touchmove',
                (e) => {
                    e.preventDefault();
                    if (!e.touches.length) return;
                    this.isHovering = true;
                    updateFromClient(e.touches[0].clientX, e.touches[0].clientY);
                },
                { passive: false }
            );

            const endTouch = () => {
                this.isHovering = false;
                this.mouse.vX = 0;
                this.mouse.vY = 0;
            };
            this._addListener(surface, 'touchend', endTouch, { passive: true });
            this._addListener(surface, 'touchcancel', endTouch, { passive: true });

            let resizeTimer;
            const onResize = () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    if (this.destroyed || !this.renderer) return;
                    this.width = this.container.clientWidth;
                    this.height =
                        this.container.clientHeight || Math.min(window.innerHeight * 0.4, 400);
                    this.camera.left = this.width / -2;
                    this.camera.right = this.width / 2;
                    this.camera.top = this.height / 2;
                    this.camera.bottom = this.height / -2;
                    this.camera.updateProjectionMatrix();
                    this.renderer.setSize(this.width, this.height);
                    this.plane.geometry.dispose();
                    this.plane.geometry = new THREE.PlaneGeometry(this.width, this.height);
                    const oldTexture = this.material.uniforms.uTexture.value;
                    this.material.uniforms.uTexture.value = this.createTextTexture();
                    oldTexture.dispose();
                }, 150);
            };
            this._addListener(window, 'resize', onResize);

            const onVisibility = () => {
                this._pageVisible = document.visibilityState === 'visible';
                this._syncActive();
            };
            this._pageVisible = document.visibilityState === 'visible';
            this._inView = true;
            this._addListener(document, 'visibilitychange', onVisibility);

            if (typeof IntersectionObserver === 'function') {
                const io = new IntersectionObserver(
                    (entries) => {
                        const entry = entries[0];
                        this._inView = Boolean(entry && entry.isIntersecting);
                        this._syncActive();
                    },
                    { root: null, rootMargin: '80px 0px', threshold: 0 }
                );
                io.observe(this.container);
                this._eventCleanups.push(() => {
                    try {
                        io.disconnect();
                    } catch (_) {
                        /* ignore */
                    }
                });
            }

            const canvas = this.renderer.domElement;
            this._onContextLost = (e) => {
                e.preventDefault();
                const activateStatic =
                    global.QualquerTeclaMassiveBrand &&
                    typeof global.QualquerTeclaMassiveBrand.activateStatic === 'function'
                        ? global.QualquerTeclaMassiveBrand.activateStatic
                        : null;
                if (activateStatic) {
                    activateStatic(this.container, 'context-lost');
                } else {
                    this.destroy();
                }
            };
            this._addListener(canvas, 'webglcontextlost', this._onContextLost);
        }

        updateFluid() {
            const data = this.fluidData;
            const grid = this.gridSize;

            for (let i = 0; i < data.length; i += 4) {
                data[i] *= this.relaxation;
                data[i + 1] *= this.relaxation;
            }

            if (
                this.isHovering &&
                (Math.abs(this.mouse.vX) > 0.0001 || Math.abs(this.mouse.vY) > 0.0001)
            ) {
                const mouseGridX = this.mouse.x * grid;
                const mouseGridY = this.mouse.y * grid;
                const radiusSq = this.mouseRadius * grid * (this.mouseRadius * grid);

                for (let y = 0; y < grid; y++) {
                    for (let x = 0; x < grid; x++) {
                        const distSq = Math.pow(mouseGridX - x, 2) + Math.pow(mouseGridY - y, 2);
                        if (distSq < radiusSq) {
                            const index = (y * grid + x) * 4;
                            const force = Math.min(radiusSq / Math.max(distSq, 0.1), 10.0);
                            data[index] += this.mouse.vX * this.forceMultiplier * force;
                            data[index + 1] += this.mouse.vY * this.forceMultiplier * force;
                        }
                    }
                }
                this.mouse.vX *= 0.1;
                this.mouse.vY *= 0.1;
            }

            this.dataTexture.needsUpdate = true;
        }

        animate() {
            if (!this.active || this.destroyed) {
                this.rafId = null;
                return;
            }
            this.rafId = requestAnimationFrame(() => this.animate());
            this.renderFrame();
        }

        _syncActive() {
            if (this.destroyed || this._forcedPause) {
                this.active = false;
                if (this.rafId != null) {
                    cancelAnimationFrame(this.rafId);
                    this.rafId = null;
                }
                return;
            }
            const shouldRun =
                this._pageVisible !== false && this._inView !== false;
            this.active = shouldRun;
            if (shouldRun && !this.rafId) this.animate();
            if (!shouldRun && this.rafId != null) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
        }

        pause() {
            this._forcedPause = true;
            this._syncActive();
        }

        resume() {
            this._forcedPause = false;
            this._syncActive();
        }

        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.active = false;
            if (this.rafId != null) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
            this._eventCleanups.forEach((fn) => {
                try {
                    fn();
                } catch (_) {
                    /* ignore */
                }
            });
            this._eventCleanups = [];

            try {
                if (this.plane && this.plane.geometry) this.plane.geometry.dispose();
                if (this.material) this.material.dispose();
                if (this.textTexture) this.textTexture.dispose();
                if (this.dataTexture) this.dataTexture.dispose();
                if (this.renderer) {
                    this.renderer.dispose();
                    const canvas = this.renderer.domElement;
                    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
                }
            } catch (_) {
                /* ignore */
            }

            this.renderer = null;
            this.material = null;
            this.scene = null;
            this.camera = null;
            this.plane = null;
            if (this.container) {
                this.container.__liquidInstance = null;
            }
        }
    }

    function shouldSkipContainer(container) {
        if (!container) return true;
        if (container.classList.contains('is-liquid-static')) return true;
        if (container.dataset.liquid === 'false') return true;
        const inst = container.__liquidInstance;
        if (inst && !inst.destroyed && inst.active) return true;
        if (container.dataset.liquidBooting === '1') return true;
        return false;
    }

    function boot(container, activateStatic) {
        if (shouldSkipContainer(container)) return Promise.resolve(null);
        if (!global.THREE) {
            liquidDebug('fallback: three-load-failed');
            if (activateStatic) activateStatic(container, 'three-load-failed');
            return Promise.resolve(null);
        }

        const preflight = canUseLiquidWebGL();
        liquidDebug('preflight:', preflight);
        if (!preflight.ok) {
            liquidDebug('fallback:', preflight.reason || 'webgl-unavailable');
            if (activateStatic) activateStatic(container, preflight.reason || 'webgl-unavailable');
            return Promise.resolve(null);
        }

        container.dataset.liquidBooting = '1';
        liquidDebug('attempting WebGL');

        let instance;
        try {
            instance = new LiquidDistortion(container);
        } catch (err) {
            console.warn('[LiquidDistortion] Constructor falhou:', err);
            delete container.dataset.liquidBooting;
            liquidDebug('fallback: webgl-unavailable (constructor)');
            if (activateStatic) activateStatic(container, 'webgl-unavailable');
            return Promise.resolve(null);
        }

        if (instance.setupFailed || !instance.renderer) {
            instance.destroy();
            delete container.dataset.liquidBooting;
            liquidDebug('fallback: webgl-unavailable (setup)');
            if (activateStatic) activateStatic(container, 'webgl-unavailable');
            return Promise.resolve(null);
        }

        try {
            instance.renderFrame();
        } catch (err) {
            console.warn('[LiquidDistortion] Render inicial falhou:', err);
            instance.destroy();
            delete container.dataset.liquidBooting;
            liquidDebug('fallback: webgl-unavailable (render)');
            if (activateStatic) activateStatic(container, 'webgl-unavailable');
            return Promise.resolve(null);
        }

        const shaderCheck = validateRealShaders(instance.renderer, instance.material);
        liquidDebug('shader validation:', shaderCheck);
        if (!shaderCheck.ok) {
            instance.destroy();
            delete container.dataset.liquidBooting;
            liquidDebug('fallback: shader-failed');
            if (activateStatic) activateStatic(container, 'shader-failed');
            return Promise.resolve(null);
        }

        if (container.classList.contains('is-liquid-static')) {
            instance.destroy();
            delete container.dataset.liquidBooting;
            return Promise.resolve(null);
        }

        probeFramebufferReadable(instance.renderer);
        return Promise.resolve(startLiquidInstance(container, instance));
    }

    function pauseAll() {
        document.querySelectorAll('.massive-brand-text').forEach((el) => {
            const inst = el.__liquidInstance;
            if (inst && typeof inst.pause === 'function') inst.pause();
        });
    }

    function resumeAll() {
        document.querySelectorAll('.massive-brand-text').forEach((el) => {
            const inst = el.__liquidInstance;
            if (inst && typeof inst.resume === 'function') inst.resume();
        });
    }

    global.LiquidDistortion = {
        canUseLiquidWebGL,
        boot,
        pauseAll,
        resumeAll,
        LiquidDistortion
    };
})(window);
