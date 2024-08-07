import type { ISourceOptions } from '@tsparticles/engine'

export const particlesOptions: ISourceOptions = {
  fullScreen: {
    zIndex: -1,
    enable: false,
    // fpsLimit: 60, TODO: find waht to replcate with
  },
  resize: true,
  particles: {
    number: {
      value: 0,
    },
    colors: [
      '256cf6',
      'ff1569',
      'ff1569',
      'ff1569',
      'ffa830',
      'ffa830',
    ],
    shape: {
      type: [
        'circle',
        'square',
      ],
      options: {},
    },
    opacity: {
      value: {
        min: 0,
        max: 1,
      },
      animation: {
        enable: true,
        speed: 2,
        startValue: 'max',
        destroy: 'min',
      },
    },
    size: {
      value: {
        min: 2,
        max: 4,
      },
    },
    links: {
      enable: false,
    },
    life: {
      duration: {
        sync: true,
        value: 2,
      },
      count: 1,
    },
    move: {
      enable: true,
      gravity: {
        enable: true,
        acceleration: 10,
      },
      speed: {
        min: 10,
        max: 15,
      },
      decay: 0.1,
      direction: 'none',
      straight: false,
      outModes: {
        default: 'destroy',
        top: 'none',
      },
    },
    rotate: {
      value: {
        min: 0,
        max: 360,
      },
      direction: 'random',
      move: true,
      animation: {
        enable: true,
        speed: 60,
      },
    },
    tilt: {
      direction: 'random',
      enable: true,
      move: true,
      value: {
        min: 0,
        max: 360,
      },
      animation: {
        enable: true,
        speed: 60,
      },
    },
    roll: {
      darken: {
        enable: true,
        value: 25,
      },
      enable: true,
      speed: {
        min: 15,
        max: 25,
      },
    },
    wobble: {
      distance: 30,
      enable: true,
      move: true,
      speed: {
        min: -15,
        max: 15,
      },
    },
  },
  emitters: {
    life: {
      count: 0,
      duration: 0.1,
      delay: 0.3,
    },
    rate: {
      delay: 0.1,
      quantity: 100,
    },
    size: {
      width: 0,
      height: 0,
    },
  },
}
