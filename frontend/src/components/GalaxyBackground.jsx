import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function GalaxyBackground() {
    const mountRef = useRef(null);

    useEffect(() => {
        const container = mountRef.current;
        if (!container) return;

        const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        // -----------------------------
        // SCENE
        // -----------------------------
        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(
            55,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );

        camera.position.set(0.8, 7.2, 14.8);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
        });

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 1.5)
        );

        renderer.setClearColor(0x000000, 0);

        container.appendChild(renderer.domElement);

        // -----------------------------
        // GALAXY GROUP
        // -----------------------------
        const galaxy = new THREE.Group();
        scene.add(galaxy);

        // Slight tilt gives the galaxy depth.
        galaxy.rotation.x = -0.12;
        galaxy.rotation.z = -0.48;

        const isMobile = window.innerWidth < 768;
        const particleCount = isMobile ? 20000 : 34000;

        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);

        const white = new THREE.Color("#ffffff");
        const ice = new THREE.Color("#bfe9ff");
        const blue = new THREE.Color("#72bfff");
        const warm = new THREE.Color("#ffb18a");

        const branches = 2;
        const maxRadius = 6.3;

        // -----------------------------
        // PARTICLES
        // -----------------------------
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;

            /*
             * Radius distribution biased toward center.
             * More stars near the core, fewer outside.
             */
            const radius =
                Math.pow(Math.random(), 1.75) * maxRadius;

            const branch =
                (i % branches) *
                ((Math.PI * 2) / branches);

            // Controls how tightly the spiral wraps.
            const spin = radius * 1.42;

            /*
             * Spread gets wider farther from the center.
             */
            const spread =
                0.12 + Math.pow(radius / maxRadius, 1.7) * 1.25;

            const randomAngle =
                (Math.random() - 0.5) * spread;

            const angle =
                branch +
                spin +
                randomAngle;

            /*
             * More irregularity near outer arms.
             */
            const radialNoise =
                (Math.random() - 0.5) *
                (0.08 + radius * 0.075);

            const finalRadius =
                Math.max(0, radius + radialNoise);

            const x =
                Math.cos(angle) * finalRadius +
                (Math.random() - 0.5) *
                (0.04 + radius * 0.025);

            const z =
                Math.sin(angle) * finalRadius +
                (Math.random() - 0.5) *
                (0.04 + radius * 0.025);

            /*
             * Galaxy disk thickness.
             * Core is slightly puffier.
             */
            const coreThickness =
                0.06 +
                0.38 *
                Math.exp(-radius * 0.55);

            const outerThickness =
                0.035 +
                radius * 0.015;

            const y =
                (Math.random() - 0.5) *
                (coreThickness + outerThickness);

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            // -----------------------------
            // STAR COLOR
            // -----------------------------
            const color = new THREE.Color();

            const centerStrength =
                1 - Math.min(radius / maxRadius, 1);

            const randomColor = Math.random();

            if (randomColor > 0.965) {
                color.copy(warm);
            } else if (randomColor > 0.72) {
                color.copy(ice);
            } else if (randomColor > 0.52) {
                color.copy(blue);
            } else {
                color.copy(white);
            }

            /*
             * Brighten core particles.
             */
            color.lerp(
                white,
                Math.pow(centerStrength, 2) * 0.72
            );

            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;

            /*
             * Mostly tiny stars with occasional
             * brighter/larger stars.
             */
            const brightStar = Math.random() > 0.992;

            sizes[i] = brightStar
                ? 2.2 + Math.random() * 2.3
                : 0.45 + Math.random() * 1.15;
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
        );

        geometry.setAttribute(
            "color",
            new THREE.BufferAttribute(colors, 3)
        );

        geometry.setAttribute(
            "aSize",
            new THREE.BufferAttribute(sizes, 1)
        );

        // -----------------------------
        // PARTICLE SHADER
        // -----------------------------
        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            vertexColors: true,
            blending: THREE.AdditiveBlending,

            uniforms: {
                uPixelRatio: {
                    value: Math.min(
                        window.devicePixelRatio || 1,
                        1.5
                    ),
                },

                uTime: {
                    value: 0,
                },
            },

            vertexShader: `
        attribute float aSize;

        uniform float uPixelRatio;
        uniform float uTime;

        varying vec3 vColor;
        varying float vTwinkle;

        void main() {
          vColor = color;

          vec4 modelPosition =
            modelMatrix * vec4(position, 1.0);

          vec4 viewPosition =
            viewMatrix * modelPosition;

          vec4 projectedPosition =
            projectionMatrix * viewPosition;

          gl_Position = projectedPosition;

          float twinkle =
            sin(
              uTime * 1.15 +
              position.x * 5.0 +
              position.z * 3.5
            );

          vTwinkle =
            0.82 + twinkle * 0.18;

          float perspectiveSize =
            (105.0 / -viewPosition.z);

          gl_PointSize =
            aSize *
            uPixelRatio *
            perspectiveSize;

          gl_PointSize =
            clamp(gl_PointSize, 1.0, 9.0);
        }
      `,

            fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;

        void main() {
          vec2 uv =
            gl_PointCoord - vec2(0.5);

          float distanceToCenter =
            length(uv);

          if (distanceToCenter > 0.5) {
            discard;
          }

          float core =
            1.0 -
            smoothstep(
              0.0,
              0.16,
              distanceToCenter
            );

          float glow =
            1.0 -
            smoothstep(
              0.08,
              0.5,
              distanceToCenter
            );

          float alpha =
            (glow * 0.82 + core * 0.95) *
            vTwinkle;

          vec3 finalColor =
            vColor *
            (1.0 + core * 1.4);

          gl_FragColor =
            vec4(finalColor, alpha);
        }
      `,
        });

        const stars = new THREE.Points(
            geometry,
            material
        );

        galaxy.add(stars);
        galaxy.position.x = 2.2;
        galaxy.position.y = -0.4;
        galaxy.position.z = -0.3;

        // -----------------------------
        // BRIGHT GALACTIC CORE
        // -----------------------------
        const coreTextureCanvas =
            document.createElement("canvas");

        coreTextureCanvas.width = 256;
        coreTextureCanvas.height = 256;

        const ctx =
            coreTextureCanvas.getContext("2d");

        const gradient =
            ctx.createRadialGradient(
                128,
                128,
                0,
                128,
                128,
                128
            );

        gradient.addColorStop(
            0,
            "rgba(255,255,255,1)"
        );

        gradient.addColorStop(
            0.08,
            "rgba(245,252,255,0.95)"
        );

        gradient.addColorStop(
            0.25,
            "rgba(170,220,255,0.48)"
        );

        gradient.addColorStop(
            0.55,
            "rgba(90,160,255,0.12)"
        );

        gradient.addColorStop(
            1,
            "rgba(0,0,0,0)"
        );

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);

        const coreTexture =
            new THREE.CanvasTexture(
                coreTextureCanvas
            );

        const coreMaterial =
            new THREE.SpriteMaterial({
                map: coreTexture,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.60,
            });

        const core = new THREE.Sprite(
            coreMaterial
        );

        core.scale.set(2.1, 2.1, 1);

        galaxy.add(core);

        // Larger subtle halo.
        const haloMaterial =
            new THREE.SpriteMaterial({
                map: coreTexture,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.15,
            });

        const halo = new THREE.Sprite(
            haloMaterial
        );

        halo.scale.set(4.4, 4.4, 1);

        galaxy.add(halo);

        // -----------------------------
        // BACKGROUND STARS
        // -----------------------------
        const backgroundCount =
            isMobile ? 550 : 1100;

        const bgPositions =
            new Float32Array(
                backgroundCount * 3
            );

        for (
            let i = 0;
            i < backgroundCount;
            i++
        ) {
            const i3 = i * 3;

            bgPositions[i3] =
                (Math.random() - 0.5) * 30;

            bgPositions[i3 + 1] =
                (Math.random() - 0.5) * 18;

            bgPositions[i3 + 2] =
                -4 - Math.random() * 12;
        }

        const bgGeometry =
            new THREE.BufferGeometry();

        bgGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(
                bgPositions,
                3
            )
        );

        const bgMaterial =
            new THREE.PointsMaterial({
                color: 0xb9d9ff,
                size: 0.018,
                transparent: true,
                opacity: 0.42,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });

        const backgroundStars =
            new THREE.Points(
                bgGeometry,
                bgMaterial
            );

        scene.add(backgroundStars);

        // -----------------------------
        // INTERACTION
        // -----------------------------
        let pointerX = 0;
        let pointerY = 0;

        let targetRotationX =
            galaxy.rotation.x;

        let targetRotationZ =
            galaxy.rotation.z;

        let dragging = false;
        let lastX = 0;
        let lastY = 0;

        let targetZoom = camera.position.z;

        const handlePointerMove = (event) => {
            pointerX =
                (event.clientX /
                    window.innerWidth -
                    0.5) *
                2;

            pointerY =
                (event.clientY /
                    window.innerHeight -
                    0.5) *
                2;

            if (dragging) {
                const dx =
                    event.clientX - lastX;

                const dy =
                    event.clientY - lastY;

                targetRotationZ += dx * 0.0025;
                targetRotationX += dy * 0.0018;

                lastX = event.clientX;
                lastY = event.clientY;
            }
        };

        const handlePointerDown = (event) => {
            /*
             * Only begin galaxy drag when the
             * actual background receives it.
             * Existing WARROOM X UI stays untouched.
             */
            if (event.target !== renderer.domElement) {
                return;
            }

            dragging = true;
            lastX = event.clientX;
            lastY = event.clientY;
        };

        const handlePointerUp = () => {
            dragging = false;
        };

        const handleWheel = (event) => {
            /*
             * Do not hijack normal application scrolling.
             * Ctrl/Meta + wheel provides optional
             * galaxy zoom instead.
             */
            if (!event.ctrlKey && !event.metaKey) {
                return;
            }

            targetZoom += event.deltaY * 0.006;

            targetZoom = THREE.MathUtils.clamp(
                targetZoom,
                7.5,
                14
            );
        };

        window.addEventListener(
            "pointermove",
            handlePointerMove
        );

        window.addEventListener(
            "pointerdown",
            handlePointerDown
        );

        window.addEventListener(
            "pointerup",
            handlePointerUp
        );

        window.addEventListener(
            "pointercancel",
            handlePointerUp
        );

        window.addEventListener(
            "wheel",
            handleWheel,
            { passive: true }
        );

        // -----------------------------
        // RESIZE
        // -----------------------------
        const handleResize = () => {
            camera.aspect =
                window.innerWidth /
                window.innerHeight;

            camera.updateProjectionMatrix();

            renderer.setSize(
                window.innerWidth,
                window.innerHeight
            );

            renderer.setPixelRatio(
                Math.min(
                    window.devicePixelRatio || 1,
                    1.5
                )
            );

            material.uniforms.uPixelRatio.value =
                Math.min(
                    window.devicePixelRatio || 1,
                    1.5
                );
        };

        window.addEventListener(
            "resize",
            handleResize
        );

        // -----------------------------
        // ANIMATION
        // -----------------------------
        const clock = new THREE.Clock();

        let frameId;

        const animate = () => {
            frameId =
                requestAnimationFrame(animate);

            const elapsed =
                clock.getElapsedTime();

            material.uniforms.uTime.value =
                reduceMotion ? 0 : elapsed;

            if (!reduceMotion) {
                // Very slow natural rotation.
                targetRotationZ += 0.00048;

                // Mouse parallax.
                galaxy.position.x +=
                    (pointerX * 0.22 -
                        galaxy.position.x) *
                    0.018;

                galaxy.position.y +=
                    (-pointerY * 0.12 -
                        galaxy.position.y) *
                    0.018;

                galaxy.rotation.x +=
                    (targetRotationX +
                        pointerY * 0.025 -
                        galaxy.rotation.x) *
                    0.035;

                galaxy.rotation.z +=
                    (targetRotationZ +
                        pointerX * 0.018 -
                        galaxy.rotation.z) *
                    0.035;

                camera.position.z +=
                    (targetZoom -
                        camera.position.z) *
                    0.05;

                // Gentle core breathing.
                const pulse =
                    1 +
                    Math.sin(elapsed * 0.8) *
                    0.035;

                core.scale.set(
                    2.1 * pulse,
                    2.1 * pulse,
                    1
                );

                halo.material.opacity =
                    0.14 +
                    Math.sin(elapsed * 0.7) *
                    0.015;

                backgroundStars.rotation.y =
                    elapsed * 0.003;
            }

            renderer.render(scene, camera);
        };

        animate();

        // -----------------------------
        // CLEANUP
        // -----------------------------
        return () => {
            cancelAnimationFrame(frameId);

            window.removeEventListener(
                "pointermove",
                handlePointerMove
            );

            window.removeEventListener(
                "pointerdown",
                handlePointerDown
            );

            window.removeEventListener(
                "pointerup",
                handlePointerUp
            );

            window.removeEventListener(
                "pointercancel",
                handlePointerUp
            );

            window.removeEventListener(
                "wheel",
                handleWheel
            );

            window.removeEventListener(
                "resize",
                handleResize
            );

            geometry.dispose();
            material.dispose();

            bgGeometry.dispose();
            bgMaterial.dispose();

            coreMaterial.dispose();
            haloMaterial.dispose();
            coreTexture.dispose();

            renderer.dispose();

            if (
                renderer.domElement.parentNode ===
                container
            ) {
                container.removeChild(
                    renderer.domElement
                );
            }
        };
    }, []);

    return (
        <div
            ref={mountRef}
            className="galaxy-background"
            aria-hidden="true"
        />
    );
}