const plugin = require('tailwindcss/plugin')
const colors = require('tailwindcss/colors')
const defaultTheme = require('tailwindcss/defaultTheme')
const konstaConfig = require('konsta/config')

const primary = '#515271'
const secondary = '#119eff'
const tertiary = '#6876e1'
const success = '#88d4a6'
const warning = '#ff7211'
const danger = '#456b9a'
const accent = '#1FB2A5'
const neutral = '#191D24'
const base100 = '#2A303C'
const info = '#3ABFF8'

module.exports = konstaConfig({
  mode: 'jit',
  konsta: {
    colors: {
      primary,
      secondary,
      success,
      warning,
      danger,
    },
  },
  daisyui: {
    themes: [
      {
        capgotheme: {
          primary,
          secondary,
          success,
          warning,
          'error': danger,
          accent,
          neutral,
          'base-100': base100,
          info,
        },
      },
    ],
  },
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        16: 'repeat(16, minmax(0, 1fr))',
      },
      boxShadow: {
        DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.02)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.01)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.01)',
      },
      outline: {
        blue: '2px solid rgba(0, 112, 244, 0.5)',
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif', ...defaultTheme.fontFamily.sans],
        prompt: ['Prompt', 'sans-serif', ...defaultTheme.fontFamily.sans],
        light: ['AirbnbCerealLight', 'sans-serif', ...defaultTheme.fontFamily.sans],
        medium: ['AirbnbCerealMedium', 'sans-serif', ...defaultTheme.fontFamily.sans],
        bold: ['AirbnbCerealBold', 'sans-serif', ...defaultTheme.fontFamily.sans],
        sans: ['Plus Jakarta Sans', ...defaultTheme.fontFamily.sans],

      },
      fontSize: {
        'tiny': '.4rem',
        'xs': ['0.75rem', { lineHeight: '1.5' }],
        'sm': ['0.875rem', { lineHeight: '1.5715' }],
        'base': ['1rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        'lg': ['1.125rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        'xl': ['1.25rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        '2xl': ['1.5rem', { lineHeight: '1.33', letterSpacing: '-0.01em' }],
        '3xl': ['1.88rem', { lineHeight: '1.33', letterSpacing: '-0.01em' }],
        '4xl': ['2.25rem', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        '5xl': ['3rem', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        '6xl': ['3.75rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '65ch',
            color: 'inherit',
            a: {
              'color': 'inherit',
              'opacity': 0.75,
              'fontWeight': '500',
              'textDecoration': 'underline',
              '&:hover': {
                opacity: 1,
                color: colors.teal[600],
              },
            },
            b: { color: 'inherit' },
            strong: { color: 'inherit' },
            em: { color: 'inherit' },
            h1: { color: 'inherit' },
            h2: { color: 'inherit' },
            h3: { color: 'inherit' },
            h4: { color: 'inherit' },
            code: { color: 'inherit' },
          },
        },
      },
      colors: {
        ...colors,
        'gray': colors.gray,
        'amber': colors.amber,
        'rose': colors.rose,
        'emerald': colors.emerald,
        'orange': colors.orange,
        'teal': colors.teal,
        'slate': colors.slate,
        'pumpkin-orange': {
          50: '#ffa443',
          100: '#ff9a39',
          200: '#ff902f',
          300: '#ff8625',
          400: '#ff7c1b',
          500: warning,
          600: '#f56807',
          700: '#eb5e00',
          800: '#e15400',
          900: '#d74a00',
        },
        'muted-blue': {
          50: '#779dcc',
          100: '#6d93c2',
          200: '#6389b8',
          300: '#597fae',
          400: '#4f75a4',
          500: danger,
          600: '#3b6190',
          700: '#315786',
          800: '#274d7c',
          900: '#1d4372',
        },
        'azure': {
          50: '#43d0ff',
          100: '#39c6ff',
          200: '#2fbcff',
          300: '#25b2ff',
          400: '#1ba8ff',
          500: secondary,
          600: '#0794f5',
          700: '#008aeb',
          800: '#0080e1',
          900: '#0076d7',
        },
        'black-russian': {
          50: '#f4f6fb',
          100: '#e8ecf6',
          200: '#cbd7ec',
          300: '#9db4dc',
          400: '#698cc7',
          500: '#466eb1',
          600: '#345595',
          700: '#2b4479',
          800: '#273c65',
          900: '#111827',
        },
        'vista-blue': {
          50: '#baffd8',
          100: '#b0fcce',
          200: '#a6f2c4',
          300: '#9ce8ba',
          400: '#92deb0',
          500: success,
          600: '#7eca9c',
          700: '#74c092',
          800: '#6ab688',
          900: '#60ac7e',
        },
        'dusk': {
          50: '#8384a3',
          100: '#797a99',
          200: '#6f708f',
          300: '#656685',
          400: '#5b5c7b',
          500: primary,
          600: '#474867',
          700: '#3d3e5d',
          800: '#333453',
          900: '#292a49',
        },
        'powder-blue': {
          50: '#e8ffff',
          100: '#deffff',
          200: '#d4fbfe',
          300: '#caf1f4',
          400: '#c0e7ea',
          500: '#b6dde0',
          600: '#acd3d6',
          700: '#a2c9cc',
          800: '#98bfc2',
          900: '#8eb5b8',
        },
        'cornflower': {
          50: '#9aa8ff',
          100: '#909eff',
          200: '#8694ff',
          300: '#7c8af5',
          400: '#7280eb',
          500: tertiary,
          600: '#5e6cd7',
          700: '#5462cd',
          800: '#4a58c3',
          900: '#404eb9',
        },
        'misty-rose': {
          50: '#ffffff',
          100: '#ffffff',
          200: '#fffff9',
          300: '#fff8ef',
          400: '#ffeee5',
          500: '#f8e4db',
          600: '#eedad1',
          700: '#e4d0c7',
          800: '#dac6bd',
          900: '#d0bcb3',
        },
      },
      screens: {
        xs: '480px',
      },
      borderWidth: {
        3: '3px',
      },
      minWidth: {
        36: '9rem',
        44: '11rem',
        56: '14rem',
        60: '15rem',
        72: '18rem',
        80: '20rem',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
      zIndex: {
        60: '60',
      },
    },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      black: {
        DEFAULT: '#000000',
        light: '#333333',
        dark: '#373738',
      },
      white: {
        DEFAULT: '#ffffff',
      },
      grey: {
        DEFAULT: '#999999',
        medium: '#1e1e1e',
        dark: '#515271',
      },
      green: {
        DEFAULT: '#88D4A6',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
    require('@tailwindcss/line-clamp'),
    require('@tailwindcss/container-queries'),
    require('daisyui'),
    // add custom variant for expanding sidebar
    plugin(({ addVariant, e }) => {
      addVariant('sidebar-expanded', ({ modifySelectors, separator }) => {
        modifySelectors(({ className }) => `.sidebar-expanded .${e(`sidebar-expanded${separator}${className}`)}`)
      })
    }),
  ],
})
