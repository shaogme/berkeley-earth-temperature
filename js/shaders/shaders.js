const tempColorFunction = `
    // 精美的温度-色彩渐变映射函数，支持双色盘映射
    vec3 getTempColor(float t, int mode) {
        if (mode == 0) {
            // 绝对温度色盘 (-40C 至 40C)
            vec3 c1 = vec3(0.035, 0.518, 0.890); // -40C (#0984e3)
            vec3 c2 = vec3(0.0, 0.808, 0.788);   // -20C (#00cec9)
            vec3 c3 = vec3(1.0, 0.918, 0.655);   // 0C (#ffeaa7)
            vec3 c4 = vec3(1.0, 0.463, 0.459);   // 20C (#ff7675)
            vec3 c5 = vec3(0.839, 0.188, 0.192); // 40C (#d63031)

            if (t < 0.25) {
                return mix(c1, c2, t * 4.0);
            } else if (t < 0.5) {
                return mix(c2, c3, (t - 0.25) * 4.0);
            } else if (t < 0.75) {
                return mix(c3, c4, (t - 0.5) * 4.0);
            } else {
                return mix(c4, c5, (t - 0.75) * 4.0);
            }
        } else {
            // 温度距平经典发散色盘 RdBu (-8C 至 8C)
            vec3 c1 = vec3(0.0196, 0.1882, 0.3804); // -8C (深蓝 #053061)
            vec3 c2 = vec3(0.1294, 0.4000, 0.6745); // -4C (浅蓝 #2166ac)
            vec3 c3 = vec3(0.9686, 0.9686, 0.9412); // 0C (暖白/淡黄 #f7f7f0)
            vec3 c4 = vec3(0.6980, 0.0941, 0.1686); // +4C (浅红 #b2182b)
            vec3 c5 = vec3(0.4039, 0.0, 0.1216);   // +8C (深红 #67001f)

            if (t < 0.25) {
                return mix(c1, c2, t * 4.0);
            } else if (t < 0.5) {
                return mix(c2, c3, (t - 0.25) * 4.0);
            } else if (t < 0.75) {
                return mix(c3, c4, (t - 0.5) * 4.0);
            } else {
                return mix(c4, c5, (t - 0.75) * 4.0);
            }
        }
    }
`;

export const FlatShader = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D uEarthTex;
        uniform sampler2D uTempTex;
        uniform float uOpacity;
        uniform int uLayerMode;
        
        varying vec2 vUv;

        ${tempColorFunction}

        void main() {
            vec4 earthColor = texture2D(uEarthTex, vUv);
            vec4 tempSample = texture2D(uTempTex, vUv);
            
            float tempNormalized = tempSample.r;
            float isValid = tempSample.g;

            vec3 finalRgb = earthColor.rgb;

            if (isValid > 0.5) {
                vec3 tempColor = getTempColor(tempNormalized, uLayerMode);
                finalRgb = mix(earthColor.rgb, tempColor, uOpacity);
            }

            gl_FragColor = vec4(finalRgb, 1.0);
        }
    `
};

export const GlobeShader = {
    vertexShader: `
        varying vec3 vNormal;
        varying vec2 vUv;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vUv = uv;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform sampler2D uEarthTex;
        uniform sampler2D uTempTex;
        uniform float uOpacity;
        uniform vec3 uLightDirection;
        uniform int uLayerMode;
        
        varying vec3 vNormal;
        varying vec2 vUv;

        ${tempColorFunction}

        void main() {
            vec4 earthColor = texture2D(uEarthTex, vUv);
            vec4 tempSample = texture2D(uTempTex, vUv);
            
            float tempNormalized = tempSample.r;
            float isValid = tempSample.g;

            vec3 normal = normalize(vNormal);
            float diffuse = max(dot(normal, uLightDirection), 0.0) * 0.6 + 0.4;

            vec3 finalRgb = earthColor.rgb;

            if (isValid > 0.5) {
                vec3 tempColor = getTempColor(tempNormalized, uLayerMode);
                finalRgb = mix(earthColor.rgb, tempColor, uOpacity);
            }

            gl_FragColor = vec4(finalRgb * diffuse, 1.0);
        }
    `
};
