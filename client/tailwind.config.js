/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#E5FFFB',
          50: '#F5FFFE', 100: '#E5FFFB', 200: '#C7FFF5', 300: '#A4F5E8',
          400: '#7BE5D5', 500: '#51D0C2', 600: '#31B5AA', 700: '#228F89',
          800: '#1D706D', 900: '#1B5C5C',
        },
        brand: {
          DEFAULT: '#0077B6',
          50: '#E8F7FF', 100: '#C9ECFF', 200: '#9DDEFF', 300: '#69CBF5',
          400: '#32AEE0', 500: '#078BC5', 600: '#0077B6', 700: '#006093',
          800: '#064F76', 900: '#0A425F',
        },
        'brand-dark': {
          DEFAULT: '#001CB6',
          50: '#EFF0FF', 100: '#DDE1FF', 200: '#BCC5FF', 300: '#91A0FF',
          400: '#6277F5', 500: '#354DE0', 600: '#001CB6', 700: '#00178F',
          800: '#07166D', 900: '#0B174F',
        },
        ink: '#0B1233',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 12px 36px rgba(11, 18, 51, 0.08)',
      },
    },
  },
  plugins: [],
}
