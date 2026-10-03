/**
 * Keycap QT — soleira em PNG + preenchimento 3D chapado + keycap como textura.
 *
 * Camadas (renderOrder):
 *   0–1  base 3D chapada (MeshBasicMaterial nas cores da arte). Só preenche o
 *        que a tecla expõe ao afundar; em repouso fica escondida.
 *   2    billboard fixo qt-keycap-plate.png — a soleira recortada de
 *        qt-keycap-fallback.png, com furo transparente onde estava a tecla.
 *        É a referência visual: o repouso mostra os pixels reais da arte.
 *   3    billboard móvel qt-keycap-top.png, recortado pelos planos do soquete.
 *
 * A câmera não é arbitrária: foi resolvida pelas arestas frontais da boca da
 * saia no fallback (a soleira é a referência). Com essa câmera, um quadrado no
 * plano do chão projeta sobre a boca — é isso que faz o preenchimento 3D, os
 * planos de corte e os dois PNGs compartilharem eixo e perspectiva. Se algum
 * PNG for regerado, é obrigatório remedir e atualizar FOOTPRINT,
 * PLATE_FOOTPRINT e CAM_*.
 *
 * O encaixe não depende de profundidade: a keycap é recortada por dois planos
 * de corte que seguem as arestas frontais do soquete. Como esses planos são
 * infinitos, nenhuma parte da keycap pode aparecer fora da base, em qualquer
 * profundidade de pressão.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js';
import gsap from 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/+esm';

const DEG = Math.PI / 180;

/**
/**
 * Pegada da tecla: no novo asset qt-keycap-top.png extraído diretamente de
 * qt-keycap-fallback.png (mesmo frame 1254×1254), a pegada e a boca do furo da soleira
 * compartilham exatamente a mesma origem, escala e coordenadas.
 */
const FOOTPRINT = {
    centerX: -0.00279,
    centerY: -0.00682,
    halfWidth: 0.31938,
};

/**
 * Boca do furo da tecla dentro de qt-keycap-plate.png (mesmo frame do
 * fallback, 1254×1254). Cantos em (223; 633,3) e (1024; 637,8), ponta em
 * (618; 958). Posiciona o billboard da soleira para que a boca do PNG caia
 * exatamente sobre a boca 3D (footprintHalf).
 */
const PLATE_FOOTPRINT = {
    centerX: -0.00279,
    centerY: -0.00682,
    halfWidth: 0.31938,
};

/**
 * Resolvidos pelas duas arestas frontais da boca no fallback, que na arte têm
 * inclinação dx/dy de −1,218 e +1,269 (resíduo ≤ 1,2 px). São elas que definem
 * a boca do soquete, onde soleira e keycap se encontram.
 */
const CAM_AZIMUTH = 44.42 * DEG;
const CAM_SIN_ELEVATION = 0.80432;
const CAM_COS_ELEVATION = Math.sqrt(1 - CAM_SIN_ELEVATION * CAM_SIN_ELEVATION);

/**
 * Meia-aresta, no plano do chão, do quadrado cuja projeção tem meia-largura 1.
 * Vem de sx = h·(cos az + sin az) para o canto lateral do quadrado.
 */
const GROUND_PER_SCREEN = 1 / (Math.cos(CAM_AZIMUTH) + Math.sin(CAM_AZIMUTH));

const TUNE = {
    /* Meia-largura da pegada em unidades de tela: define o tamanho do conjunto. */
    footprintHalf: 0.52,
    rimScale: 1.26,
    floorScale: 1.2,
    floorDepth: 0.35,
    plateDepth: 0.17,
    cornerRatio: 0.08,
    clipScale: 1.0,
    /**
     * Alturas da pegada (negativo = dentro do soquete).
     * restLift em 0.0 garante que o estado de repouso seja 100% idêntico
     * pixel a pixel ao arquivo de referência qt-keycap-fallback.png.
     */
    restLift: 0.0,
    hoverLift: 0.01,
    pressDrop: -0.09,
};

/**
 * Enquadramento da cena = enquadramento de qt-keycap-plate.png (mesmo frame
 * do fallback). A câmera ortográfica mostra exatamente a largura do billboard
 * da soleira e é centrada nele, então o canvas WebGL e o <img> de fallback
 * (object-fit: contain, host quadrado) coincidem pixel a pixel na soleira —
 * sem salto de escala quando qt-keycap-ready entra.
 */
const FRAME = TUNE.footprintHalf / PLATE_FOOTPRINT.halfWidth;

/**
 * Teto da altura da pegada: impede a saia de subir além da margem de segurança.
 */
const MAX_LIFT = 0.02;

/* Amostrados na soleira de qt-keycap-fallback.png: face (72,72,80) e parede
   (24,24,26). Chapados, sem luz: o visual da soleira vem do PNG; o 3D só
   preenche o que a tecla expõe ao afundar, na mesma cor da face.
   Well = face: evita “furo” escuro na folga da saia. */
const COLORS = {
    plateTop: 0x484850,
    plateWall: 0x181819,
    well: 0x484850,
};

/** Meia-aresta no chão que projeta com a meia-largura de tela pedida. */
function groundHalf(screenHalf) {
    return screenHalf * GROUND_PER_SCREEN;
}

function roundedRectPath(half, radius, PathCtor) {
    const r = Math.min(radius, half * 0.9);
    const path = new PathCtor();
    path.moveTo(-half + r, -half);
    path.lineTo(half - r, -half);
    path.quadraticCurveTo(half, -half, half, -half + r);
    path.lineTo(half, half - r);
    path.quadraticCurveTo(half, half, half - r, half);
    path.lineTo(-half + r, half);
    path.quadraticCurveTo(-half, half, -half, half - r);
    path.lineTo(-half, -half + r);
    path.quadraticCurveTo(-half, -half, -half + r, -half);
    return path;
}

function createBase() {
    const rimHalf = groundHalf(TUNE.footprintHalf * TUNE.rimScale);
    const wellHalf = groundHalf(TUNE.footprintHalf);
    const depth = TUNE.plateDepth;

    const outline = roundedRectPath(rimHalf, rimHalf * TUNE.cornerRatio, THREE.Shape);
    outline.holes.push(
        roundedRectPath(wellHalf, wellHalf * TUNE.cornerRatio, THREE.Path)
    );

    /* Sem bevel: é preenchimento chapado atrás do PNG da soleira, não relevo. */
    const plateGeo = new THREE.ExtrudeGeometry(outline, {
        depth,
        bevelEnabled: false,
        curveSegments: 16,
    });
    plateGeo.rotateX(-Math.PI / 2);
    plateGeo.translate(0, -depth, 0);

    /* ExtrudeGeometry separa em dois grupos: 0 = tampas, 1 = paredes. */
    const plateMats = [
        new THREE.MeshBasicMaterial({ color: COLORS.plateTop }),
        new THREE.MeshBasicMaterial({ color: COLORS.plateWall }),
    ];

    const group = new THREE.Group();
    const plate = new THREE.Mesh(plateGeo, plateMats);
    plate.renderOrder = 0;
    group.add(plate);

    const floorHalf = groundHalf(TUNE.footprintHalf * TUNE.floorScale);
    const floorGeo = new THREE.ShapeGeometry(
        roundedRectPath(floorHalf, floorHalf * TUNE.cornerRatio, THREE.Shape),
        16
    );
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.translate(0, -depth * TUNE.floorDepth, 0);

    /* Sem iluminação: o fundo é o que aparece na folga ao redor da saia, e essa
       folga precisa ler como sombra de valor constante em qualquer estado. */
    const floor = new THREE.Mesh(
        floorGeo,
        new THREE.MeshBasicMaterial({ color: COLORS.well })
    );
    floor.renderOrder = 1;
    group.add(floor);

    return group;
}

/**
 * Plano que contém uma aresta do chão e a direção de visão. Ele projeta
 * exatamente sobre a reta dessa aresta na tela, então cortar a keycap por ele
 * equivale a esconder tudo o que passa da boca do soquete.
 */
function edgeClipPlane(pointOnEdge, edgeDir, viewDir, keepPoint) {
    const normal = new THREE.Vector3().crossVectors(edgeDir, viewDir).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pointOnEdge);
    if (plane.distanceToPoint(keepPoint) < 0) plane.negate();
    return plane;
}

/** As duas arestas frontais da linha de corte do soquete, como planos. */
function socketClipPlanes(camera) {
    const wellHalf = groundHalf(TUNE.footprintHalf * TUNE.clipScale);
    const view = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    /* Azimute em (0°, 90°) põe a câmera em +x/+z: as arestas próximas são essas. */
    const keep = new THREE.Vector3(0, 4, 0);
    return [
        edgeClipPlane(
            new THREE.Vector3(wellHalf, 0, 0),
            new THREE.Vector3(0, 0, 1),
            view,
            keep
        ),
        edgeClipPlane(
            new THREE.Vector3(0, 0, wellHalf),
            new THREE.Vector3(1, 0, 0),
            view,
            keep
        ),
    ];
}

function loadTexture(url) {
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(
            url,
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = 8;
                resolve(tex);
            },
            undefined,
            reject
        );
    });
}

function createKeycap(texture, clipPlanes) {
    const img = texture.image;
    const planeWidth = TUNE.footprintHalf / FOOTPRINT.halfWidth;
    const planeHeight = planeWidth * (img.height / img.width);

    const geo = new THREE.PlaneGeometry(planeWidth, planeHeight);
    /**
     * Sem depthTest: quem recorta a saia são os planos de corte. Depender da
     * profundidade do aro reabria z-fighting com a parede interna do poço e
     * deixava a keycap escapar por baixo assim que ela passava da silhueta.
     */
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        clippingPlanes: clipPlanes,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    /* Onde fica o centro da pegada dentro do plano, em unidades de mundo. */
    mesh.userData.footprint = {
        x: FOOTPRINT.centerX * planeWidth,
        y: FOOTPRINT.centerY * planeWidth,
    };
    return mesh;
}

/**
 * Soleira: os pixels reais de qt-keycap-fallback.png, sem a tecla. Billboard
 * fixo (não recebe capOffset), escalado e posicionado para que a boca do furo
 * coincida com a boca 3D. Desenha sobre o preenchimento 3D e sobre a saia da keycap
 * para conferir mascaramento natural do aro frontal com anti-aliasing da arte.
 */
function createPlate(texture, camera) {
    const img = texture.image;
    const planeWidth = TUNE.footprintHalf / PLATE_FOOTPRINT.halfWidth;
    const planeHeight = planeWidth * (img.height / img.width);

    const geo = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    mesh.quaternion.copy(camera.quaternion);

    /* Centro da boca do furo cai em (0, 0) na tela. */
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    mesh.position
        .copy(camRight)
        .multiplyScalar(-PLATE_FOOTPRINT.centerX * planeWidth)
        .addScaledVector(camUp, -PLATE_FOOTPRINT.centerY * planeWidth);
    return mesh;
}

/** URL da soleira derivada da URL da tecla: preserva o `?v=` do cache bust. */
function plateTextureUrl(textureUrl) {
    return textureUrl.replace('qt-keycap-top', 'qt-keycap-plate');
}

const instances = new Map();

function getMaxDpr() {
    const mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches;
    return mobile ? 2 : 3;
}

/**
 * Piso de 2 no supersampling. O corte da saia é feito por plano de corte, que
 * descarta fragmento inteiro e não recebe MSAA — em tela de DPR 1 a aresta sai
 * escadinha. O canvas é pequeno, então renderizar em 2× custa pouco.
 */
function getPixelRatio() {
    return Math.min(Math.max(window.devicePixelRatio || 1, 2), getMaxDpr());
}

function requestRender(inst) {
    if (!inst) return;
    inst.needsRender = true;
    if (inst.rafId) return;
    inst.rafId = requestAnimationFrame(() => {
        inst.rafId = 0;
        if (!inst || !inst.needsRender) return;
        inst.needsRender = false;
        inst.renderer.render(inst.scene, inst.camera);
    });
}

/**
 * Posiciona a keycap pelo centro da pegada: ele cai em (0, capOffset) na tela,
 * ou seja, no centro da boca do soquete deslocado verticalmente. O deslocamento
 * é só ao longo de camUp, que é perpendicular ao eixo de visão, então a keycap
 * desce dentro do soquete em vez de vir para a frente dele.
 */
function applyCapOffset(inst) {
    if (!inst) return;
    const { cap, camRight, camUp, capOffset } = inst;
    const foot = cap.userData.footprint;
    /* Teto rígido: overshoot de easing elástico não pode levantar a pegada
       acima da linha de corte, senão a saia descola do aro. */
    const lift = Math.min(MAX_LIFT, capOffset);
    cap.position
        .copy(camRight)
        .multiplyScalar(-foot.x)
        .addScaledVector(camUp, lift - foot.y);
    requestRender(inst);
}

function resize(inst) {
    if (!inst || !inst.host) return;
    const rect = inst.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));

    inst.renderer.setPixelRatio(getPixelRatio());
    inst.renderer.setSize(w, h, false);

    const aspect = w / h;
    const f = FRAME;
    inst.camera.left = (-f * aspect) / 2;
    inst.camera.right = (f * aspect) / 2;
    inst.camera.top = f / 2;
    inst.camera.bottom = -f / 2;
    inst.camera.updateProjectionMatrix();
    requestRender(inst);
}

/** Luzes ancoradas na câmera para o relevo do aro não depender do azimute. */
function setupLights(scene, camera) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const fromCamera = (x, y, z) =>
        new THREE.Vector3(x, y, z).applyQuaternion(camera.quaternion);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.copy(fromCamera(-3, 4, 5));
    scene.add(key);

    const fill = new THREE.PointLight(0xffffff, 0.45, 24);
    fill.position.copy(fromCamera(4, 0.5, 3));
    scene.add(fill);

    const rim = new THREE.PointLight(0xffffff, 0.3, 24);
    rim.position.copy(fromCamera(-1.5, 1.5, -4));
    scene.add(rim);
}

export async function mount(host) {
    if (!host) return false;
    if (instances.has(host)) return true;

    const canvas = host.querySelector('.qt-keycap-canvas');
    const textureUrl = host.getAttribute('data-keycap-texture');
    if (!canvas || !textureUrl) return false;

    const plateUrl = plateTextureUrl(textureUrl);
    if (plateUrl === textureUrl) return false;

    /* Sem a soleira não há referência visual: cai no <img> de fallback. */
    let texture;
    let plateTexture;
    try {
        [texture, plateTexture] = await Promise.all([
            loadTexture(textureUrl),
            loadTexture(plateUrl),
        ]);
    } catch (_) {
        return false;
    }

    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.localClippingEnabled = true;

    const scene = new THREE.Scene();

    const dist = 6;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 40);
    camera.position.set(
        dist * Math.sin(CAM_AZIMUTH) * CAM_COS_ELEVATION,
        dist * CAM_SIN_ELEVATION,
        dist * Math.cos(CAM_AZIMUTH) * CAM_COS_ELEVATION
    );
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    setupLights(scene, camera);

    const base = createBase();
    const plate = createPlate(plateTexture, camera);
    const cap = createKeycap(texture, socketClipPlanes(camera));
    scene.add(base);
    scene.add(plate);
    scene.add(cap);

    /* Centra o enquadramento no PNG da soleira (deslocamento só perpendicular
       ao eixo de visão: orientação, planos de corte e camUp não mudam). */
    camera.position.add(plate.position);
    camera.updateMatrixWorld();

    const reducedMotion =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const inst = {
        host,
        renderer,
        scene,
        camera,
        cap,
        base,
        plate,
        camRight: new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
        camUp: new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
        capOffset: TUNE.restLift,
        reducedMotion,
        pressed: false,
        hovering: false,
        activeTween: null,
        needsRender: false,
        rafId: 0,
        resizeObserver: null,
        onVisibility: null,
    };

    instances.set(host, inst);

    cap.quaternion.copy(camera.quaternion);
    applyCapOffset(inst);
    resize(inst);

    inst.resizeObserver = new ResizeObserver(() => resize(inst));
    inst.resizeObserver.observe(host);

    inst.onVisibility = () => {
        if (!instances.has(host)) return;
        if (document.hidden) {
            if (inst.rafId) {
                cancelAnimationFrame(inst.rafId);
                inst.rafId = 0;
            }
            inst.needsRender = false;
        } else {
            requestRender(inst);
        }
    };
    document.addEventListener('visibilitychange', inst.onVisibility);

    /* Inicia diretamente no repouso canônico para transição perfeitamente
       invisível e idêntica ao fallback <img>. */
    inst.capOffset = TUNE.restLift;
    applyCapOffset(inst);

    host.classList.add('qt-keycap-ready');
    requestRender(inst);
    return true;
}

function tweenCap(inst, target, duration, ease) {
    if (!inst) return;
    if (inst.activeTween) {
        inst.activeTween.kill();
        inst.activeTween = null;
    }
    if (inst.reducedMotion || !duration) {
        inst.capOffset = target;
        applyCapOffset(inst);
        return;
    }
    inst.activeTween = gsap.to(inst, {
        capOffset: target,
        duration,
        ease,
        onUpdate: () => applyCapOffset(inst),
        onComplete: () => {
            if (inst) inst.activeTween = null;
        },
    });
}

function getInst(target) {
    if (!target) {
        return instances.values().next().value || null;
    }
    if (instances.has(target)) return instances.get(target);
    if (target.querySelector) {
        const child = target.querySelector('.main-header-logo-keycap');
        if (child && instances.has(child)) return instances.get(child);
    }
    return null;
}

export function press(target) {
    const inst = getInst(target);
    if (!inst || inst.pressed) return;
    inst.pressed = true;
    tweenCap(inst, TUNE.pressDrop, 0.085, 'power2.in');
}

export function release(target) {
    const inst = getInst(target);
    if (!inst || !inst.pressed) return;
    inst.pressed = false;
    /* elastic mais contido: overshoot não "bate seco" no teto MAX_LIFT. */
    tweenCap(
        inst,
        inst.hovering ? TUNE.hoverLift : TUNE.restLift,
        0.48,
        'elastic.out(1, 0.85)'
    );
}

export function hover(target, on) {
    let inst;
    let isOn;
    if (typeof target === 'boolean') {
        isOn = target;
        inst = getInst(null);
    } else {
        inst = getInst(target);
        isOn = !!on;
    }
    if (!inst || inst.pressed) return;
    inst.hovering = isOn;
    tweenCap(inst, isOn ? TUNE.hoverLift : TUNE.restLift, 0.14, 'power2.out');
}

export function resizeInstance(target) {
    const inst = getInst(target);
    if (inst) resize(inst);
}

export function unmount(target) {
    if (!target) {
        instances.forEach((inst) => unmountInstance(inst));
        instances.clear();
        return;
    }
    const inst = getInst(target);
    if (inst) {
        unmountInstance(inst);
        instances.delete(inst.host);
    }
}

function unmountInstance(inst) {
    inst.activeTween?.kill();
    if (inst.rafId) cancelAnimationFrame(inst.rafId);
    inst.resizeObserver?.disconnect();
    if (inst.onVisibility) {
        document.removeEventListener('visibilitychange', inst.onVisibility);
    }

    inst.host?.classList.remove('qt-keycap-ready');

    inst.scene.traverse((obj) => {
        obj.geometry?.dispose();
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
                m.map?.dispose();
                m.dispose();
            });
        }
    });
    inst.renderer.dispose();
}
