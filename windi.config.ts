import { defineConfig } from 'windicss/helpers'
import colors from 'windicss/colors'
import lineClamp from 'windicss/plugin/line-clamp'
import forms from 'windicss/plugin/forms'
import typography from 'windicss/plugin/typography'
import aspectRatio from 'windicss/plugin/aspect-ratio'
import defaultTheme from 'windicss/defaultTheme'

export default defineConfig({
  darkMode: 'media',
  // https://windicss.org/posts/v30.html#attributify-mode
  attributify: true,
  plugins: [
    lineClamp,
    forms,
    typography({}),
    aspectRatio,
  ],
  variants: {
    aspectRatio: ['responsive'],
  },
  theme: {
    fontFamily: {
      light: ['AirbnbCerealLight', 'sans-serif', ...defaultTheme.fontFamily.sans],
      medium: ['AirbnbCerealMedium', 'sans-serif', ...defaultTheme.fontFamily.sans],
      bold: ['AirbnbCerealBold', 'sans-serif', ...defaultTheme.fontFamily.sans],
    },
    extend: {
      fontSize: {
        tiny: '.4rem',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', ...defaultTheme.fontFamily.sans],
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
        'gray': colors.gray,
        'amber': colors.amber,
        'rose': colors.rose,
        'emerald': colors.emerald,
        'orange': colors.orange,
        'teal': colors.teal,
        'pumpkin-orange': {
          50: '#ffa443',
          100: '#ff9a39',
          200: '#ff902f',
          300: '#ff8625',
          400: '#ff7c1b',
          500: '#ff7211',
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
          500: '#456b9a',
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
          500: '#119eff',
          600: '#0794f5',
          700: '#008aeb',
          800: '#0080e1',
          900: '#0076d7',
        },
        'vista-blue': {
          50: '#baffd8',
          100: '#b0fcce',
          200: '#a6f2c4',
          300: '#9ce8ba',
          400: '#92deb0',
          500: '#88d4a6',
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
          500: '#515271',
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
          500: '#6876e1',
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
})
