import { useRef, useId, useEffect, type CSSProperties } from 'react';
import { animate, useMotionValue, type AnimationPlaybackControls } from 'framer-motion';

/*
 * EtherealShadow — a slow, smoky full-bleed backdrop.
 *
 * A single masked color plane (the "smoke") is pushed around by two layered
 * SVG displacement maps fed by animated turbulence, giving a calm, churning
 * fog. The hue-rotate animation drives the *motion* of the turbulence, not the
 * smoke's fill — so an ember `color` stays ember while it flows.
 *
 * Adapted from a Framer/Tailwind/TS source to A-Meet's stack: plain JSX, MUI is
 * not needed here (the effect is all inline style + SVG filters), framer-motion
 * drives the single animated value. Mask + grain textures are Framer CDN assets.
 */

const MASK_URL = 'https://framerusercontent.com/images/ceBGguIpUU8luwByxuQz79t7To.png';
const NOISE_URL = 'https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png';

interface EtherealAnimation {
  scale: number;
  speed: number;
}

interface EtherealNoise {
  opacity: number;
  scale: number;
}

interface EtherealShadowProps {
  sizing?: 'fill' | 'stretch';
  color?: string;
  animation?: EtherealAnimation;
  noise?: EtherealNoise;
  style?: CSSProperties;
  className?: string;
}

function mapRange(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number) {
  if (fromLow === fromHigh) return toLow;
  const pct = (value - fromLow) / (fromHigh - fromLow);
  return toLow + pct * (toHigh - toLow);
}

function useInstanceId() {
  const id = useId();
  return `etherealshadow-${id.replace(/:/g, '')}`;
}

export default function EtherealShadow({
  sizing = 'fill',
  color = 'rgba(232, 98, 61, 1)', // A-Meet ember
  animation,
  noise,
  style,
  className,
}: EtherealShadowProps) {
  const id = useInstanceId();
  const animationEnabled = animation && animation.scale > 0;
  const feColorMatrixRef = useRef<SVGFEColorMatrixElement | null>(null);
  const hueRotate = useMotionValue(180);
  const hueRotateAnimation = useRef<AnimationPlaybackControls | null>(null);

  const displacementScale = animation ? mapRange(animation.scale, 1, 100, 20, 100) : 0;
  const animationDuration = animation ? mapRange(animation.speed, 1, 100, 1000, 50) : 1;

  useEffect(() => {
    if (!feColorMatrixRef.current || !animationEnabled) return undefined;

    if (hueRotateAnimation.current) hueRotateAnimation.current.stop();
    hueRotate.set(0);
    hueRotateAnimation.current = animate(hueRotate, 360, {
      duration: animationDuration / 25,
      repeat: Infinity,
      repeatType: 'loop',
      ease: 'linear',
      onUpdate: (value) => {
        feColorMatrixRef.current?.setAttribute('values', String(value));
      },
    });

    return () => hueRotateAnimation.current?.stop();
  }, [animationEnabled, animationDuration, hueRotate]);

  return (
    <div
      className={className}
      style={{
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -displacementScale,
          filter: animationEnabled ? `url(#${id}) blur(4px)` : 'none',
        }}
      >
        {animationEnabled && animation && (
          <svg style={{ position: 'absolute' }}>
            <defs>
              <filter id={id}>
                <feTurbulence
                  result="undulation"
                  numOctaves="2"
                  baseFrequency={`${mapRange(animation.scale, 0, 100, 0.001, 0.0005)},${mapRange(
                    animation.scale,
                    0,
                    100,
                    0.004,
                    0.002,
                  )}`}
                  seed="0"
                  type="turbulence"
                />
                <feColorMatrix ref={feColorMatrixRef} in="undulation" type="hueRotate" values="180" />
                <feColorMatrix
                  in="dist"
                  result="circulation"
                  type="matrix"
                  values="4 0 0 0 1  4 0 0 0 1  4 0 0 0 1  1 0 0 0 0"
                />
                <feDisplacementMap in="SourceGraphic" in2="circulation" scale={displacementScale} result="dist" />
                <feDisplacementMap in="dist" in2="undulation" scale={displacementScale} result="output" />
              </filter>
            </defs>
          </svg>
        )}
        <div
          style={{
            backgroundColor: color,
            maskImage: `url('${MASK_URL}')`,
            WebkitMaskImage: `url('${MASK_URL}')`,
            maskSize: sizing === 'stretch' ? '100% 100%' : 'cover',
            WebkitMaskSize: sizing === 'stretch' ? '100% 100%' : 'cover',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            width: '100%',
            height: '100%',
          }}
        />
      </div>

      {noise && noise.opacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${NOISE_URL}")`,
            backgroundSize: noise.scale * 200,
            backgroundRepeat: 'repeat',
            opacity: noise.opacity / 2,
          }}
        />
      )}
    </div>
  );
}
